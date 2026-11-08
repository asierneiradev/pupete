import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createNextEdition } from "@/lib/services/games";
import {
  addWish, copyWishesFrom, deleteWish, listMyWishes, MAX_LINKS, setSurprisePurchased, setWantsSurprise, setWishPurchased, updateWish,
} from "@/lib/services/wishes";
import { finishGame } from "@/lib/services/games";
import { performDraw } from "@/lib/services/drawing";
import { gameWith, makeAdmin, makeUser, noPreview, userById } from "./helpers";

async function setup() {
  const admin = await makeAdmin();
  const { game, people } = await gameWith(admin, [{ name: "Ane" }, { name: "Beñat" }, { name: "Carla" }], { budgetMax: 3000 });
  const users = await Promise.all(people.map((p) => userById(p.userId)));
  return { admin, game, people, users };
}

describe("lista de deseos", () => {
  it("añade una idea con varios enlaces y su vista previa", async () => {
    const { game, users } = await setup();
    const w = await addWish(users[0], game.id, {
      title: "Libro de setas", details: "Edición ilustrada", priority: 1, priceCents: 2490,
      links: ["casadellibro.com/setas", "https://amazon.es/setas"],
    }, noPreview);
    expect(w.links).toHaveLength(2);
    expect(w.links[0]).toMatchObject({ url: "https://casadellibro.com/setas", title: "Producto de prueba", priceText: "19,99 €" });
    expect(w.imageUrl).toBe("https://tienda.test/img.jpg");
    expect(w.priority).toBe(1);
  });

  it("valida título, enlaces y número máximo de enlaces", async () => {
    const { game, users } = await setup();
    await expect(addWish(users[0], game.id, { title: "  " }, noPreview)).rejects.toThrow(/Escribe/);
    await expect(addWish(users[0], game.id, { title: "X", links: ["javascript:alert(1)"] }, noPreview)).rejects.toThrow(/no es válido/);
    const many = Array.from({ length: MAX_LINKS + 1 }, (_, i) => `https://a${i}.com`);
    await expect(addWish(users[0], game.id, { title: "X", links: many }, noPreview)).rejects.toThrow(/Máximo/);
    await expect(addWish(users[0], game.id, { title: "X", imageUrl: "javascript:x" }, noPreview)).rejects.toThrow(/imagen/);
  });

  it("prioridad inválida pasa a 'me gustaría'", async () => {
    const { game, users } = await setup();
    const w = await addWish(users[0], game.id, { title: "X", priority: 9 }, noPreview);
    expect(w.priority).toBe(2);
  });

  it("si la vista previa falla, guarda el enlace igualmente", async () => {
    const { game, users } = await setup();
    const w = await addWish(users[0], game.id, { title: "X", links: ["https://a.com"] }, async () => { throw new Error("caída"); });
    expect(w.links[0]).toMatchObject({ url: "https://a.com/", title: null });
  });

  it("quien no participa no puede añadir ideas", async () => {
    const { game } = await setup();
    const outsider = await makeUser("Fuera");
    await expect(addWish(outsider, game.id, { title: "X" }, noPreview)).rejects.toThrow(/No participas/);
  });

  it("editar mantiene las vistas previas de enlaces ya conocidos y pide las nuevas", async () => {
    const { game, users } = await setup();
    const w = await addWish(users[0], game.id, { title: "X", links: ["https://a.com"] }, noPreview);
    let calls = 0;
    const counting = async (url: string) => { calls++; return { url, title: "Nuevo" }; };
    const up = await updateWish(users[0], w.id, { title: "Y", links: ["https://a.com", "https://b.com"] }, counting);
    expect(calls).toBe(1);
    expect(up.title).toBe("Y");
    expect(up.links.find((l) => l.url === "https://a.com/")!.title).toBe("Producto de prueba");
    expect(up.links.find((l) => l.url === "https://b.com/")!.title).toBe("Nuevo");
  });

  it("nadie puede editar ni borrar ideas ajenas", async () => {
    const { game, users } = await setup();
    const w = await addWish(users[0], game.id, { title: "X" }, noPreview);
    await expect(updateWish(users[1], w.id, { title: "hack" }, noPreview)).rejects.toThrow(/no es tuya/);
    await expect(deleteWish(users[1], w.id)).rejects.toThrow(/no es tuya/);
    await setWantsSurprise(users[0], game.id, true); // si no, la lista quedaría vacía
    await deleteWish(users[0], w.id);
    expect(await db.wish.count()).toBe(0);
  });

  it("la lista propia sale ordenada por prioridad y NUNCA dice si está comprado", async () => {
    const { admin, game, users } = await setup();
    await addWish(users[0], game.id, { title: "Si acaso", priority: 3 }, noPreview);
    const top = await addWish(users[0], game.id, { title: "Top", priority: 1 }, noPreview);
    await performDraw(admin, game.id);
    await db.wish.update({ where: { id: top.id }, data: { purchased: true } });
    const mine = await listMyWishes(users[0], game.id);
    expect(mine.map((w) => w.title)).toEqual(["Top", "Si acaso"]);
    expect(mine.every((w) => !("purchased" in w))).toBe(true);
  });

  it("en una sala cerrada no se edita", async () => {
    const { admin, game, users } = await setup();
    await performDraw(admin, game.id);
    await finishGame(admin, game.id);
    await expect(addWish(users[0], game.id, { title: "X" }, noPreview)).rejects.toThrow(/cerrada/);
  });

  it("copia las ideas de la edición anterior", async () => {
    const { admin, game, users } = await setup();
    await addWish(users[0], game.id, { title: "Bufanda", links: ["https://a.com"] }, noPreview);
    await addWish(users[0], game.id, { title: "Guantes" }, noPreview);
    const next = await createNextEdition(admin, game.id, "2027");
    expect(await copyWishesFrom(users[0], next.id, game.id)).toBe(2);
    const copied = await listMyWishes(users[0], next.id);
    expect(copied.map((w) => w.title).sort()).toEqual(["Bufanda", "Guantes"]);
    expect(copied.find((w) => w.title === "Bufanda")!.links).toHaveLength(1);
    await expect(copyWishesFrom(users[0], next.id, next.id)).rejects.toThrow(/otra sala/);
  });
});

describe("marcar como comprado", () => {
  it("solo quien regala puede marcar, incluido el «sorpréndeme»", async () => {
    const { admin, game, people, users } = await setup();
    const w = await addWish(users[0], game.id, { title: "X" }, noPreview);
    await performDraw(admin, game.id);
    const a = await db.assignment.findFirstOrThrow({ where: { receiverId: people[0].participantId }, include: { giver: true } });
    const giver = await userById(a.giver.userId);
    const other = users.find((u) => u.id !== giver.id && u.id !== users[0].id)!;

    await expect(setWishPurchased(other, w.id, true)).rejects.toThrow(/Solo quien le regala/);
    await expect(setWishPurchased(users[0], w.id, true)).rejects.toThrow(/Solo quien le regala/);
    await setWishPurchased(giver, w.id, true);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).purchased).toBe(true);

    await expect(setSurprisePurchased(giver, people[0].participantId, true)).rejects.toThrow(/no ha marcado/);
    await setWantsSurprise(users[0], game.id, true);
    await expect(setSurprisePurchased(other, people[0].participantId, true)).rejects.toThrow(/Solo quien/);
    await setSurprisePurchased(giver, people[0].participantId, true);
    expect((await db.participant.findUniqueOrThrow({ where: { id: people[0].participantId } })).surprisePurchased).toBe(true);
  });
});
