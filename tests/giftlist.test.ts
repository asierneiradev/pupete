import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createGame, createNextEdition, finishGame, updateGame } from "@/lib/services/games";
import { checkDraw, performDraw } from "@/lib/services/drawing";
import { joinGame, leaveGame, listParticipantsForAdmin, setHonoree } from "@/lib/services/participants";
import { addWish, copyWishesFrom, deleteWish, listMyWishes, myListState, updateWish } from "@/lib/services/wishes";
import {
  addSecretWish, claimWish, deleteSecretWish, getGiftLists, myClaims, setClaimPurchased, unclaimWish, updateSecretWish,
} from "@/lib/services/giftlist";
import { gameInput, gameWith, makeAdmin, makeUser, noPreview, publishAll, userById } from "./helpers";

/** Cumple de Miriam: ella recibe; Ane, Beñat y Carla regalan. El admin solo organiza. */
async function setup() {
  const admin = await makeAdmin();
  const { game, people } = await gameWith(admin, [{ name: "Miriam" }, { name: "Ane" }, { name: "Beñat" }, { name: "Carla" }], { kind: "GIFT_LIST", name: "Cumple de Miriam" });
  const [miriam, ane, benat, carla] = await Promise.all(people.map((p) => userById(p.userId)));
  await setHonoree(admin, game.id, people[0].participantId, true);
  await publishAll(game.id);
  return { admin, game, people, miriam, ane, benat, carla, miriamPid: people[0].participantId };
}

describe("lista de regalos · sala", () => {
  it("se crea sin sorteo, sin grupos ni buzón, y el tipo no cambia al editar", async () => {
    const admin = await makeAdmin();
    const game = await createGame(admin, gameInput({ kind: "GIFT_LIST", groupMode: "SEPARATE", anonChat: true, avoidPrevious: true }));
    expect(game).toMatchObject({ kind: "GIFT_LIST", groupMode: "NONE", anonChat: false, avoidPrevious: false, status: "OPEN" });
    const edited = await updateGame(admin, game.id, gameInput({ kind: "SECRET_SANTA", name: "Otro nombre" }));
    expect(edited.kind).toBe("GIFT_LIST");
    await expect(performDraw(admin, game.id)).rejects.toThrow(/no hay sorteo/);
    expect(await checkDraw(admin, game.id)).toMatchObject({ ok: false });
  });

  it("las salas de amigo invisible siguen siendo de amigo invisible", async () => {
    const admin = await makeAdmin();
    const game = await createGame(admin, gameInput());
    expect(game).toMatchObject({ kind: "SECRET_SANTA", allHonorees: false, anonChat: true });
    const edited = await updateGame(admin, game.id, gameInput({ kind: "GIFT_LIST" }));
    expect(edited.kind).toBe("SECRET_SANTA");
    await expect(setHonoree(admin, game.id, "x", true)).rejects.toThrow(/lista de regalos/);
  });

  it("se cierra sin sorteo y después no se toca nada", async () => {
    const { admin, game, miriam, ane } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await finishGame(admin, game.id);
    await expect(claimWish(ane, w.id, false)).rejects.toThrow(/cerrada/);
    await expect(unclaimWish(ane, w.id)).rejects.toThrow(/cerrada/);
    await expect(addSecretWish(ane, game.id, w.participantId, { title: "X" }, noPreview)).rejects.toThrow(/cerrada/);
    await expect(finishGame(admin, game.id)).rejects.toThrow(/ya está cerrada/);
  });

  it("«todos con todos»: cada persona que entra tiene lista, también con invitación", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [{ name: "Ane" }, { name: "Beñat" }], { kind: "GIFT_LIST", allHonorees: true });
    const nuevo = await makeUser("Carla");
    await joinGame(nuevo, game.joinToken);
    const ps = await db.participant.findMany({ where: { gameId: game.id } });
    expect(ps.every((p) => p.honoree)).toBe(true);
    const ane = await userById(people[0].userId);
    const lists = await getGiftLists(ane, game.id);
    expect(lists.map((l) => l.name).sort()).toEqual(["Beñat", "Carla"]);
    await expect(setHonoree(admin, game.id, people[0].participantId, false)).rejects.toThrow(/todo el mundo/);
  });

  it("al pasar una sala a «todos con todos» todos reciben", async () => {
    const { admin, game } = await setup();
    await updateGame(admin, game.id, gameInput({ kind: "GIFT_LIST", allHonorees: true }));
    expect(await db.participant.count({ where: { gameId: game.id, honoree: false } })).toBe(0);
  });

  it("la nueva edición conserva el tipo y quién recibe", async () => {
    const { admin, game } = await setup();
    await finishGame(admin, game.id);
    const next = await createNextEdition(admin, game.id, "Cumple de Miriam 2027");
    expect(next).toMatchObject({ kind: "GIFT_LIST", avoidPrevious: false });
    const hs = await db.participant.findMany({ where: { gameId: next.id, honoree: true }, include: { user: true } });
    expect(hs.map((h) => h.user.name)).toEqual(["Miriam"]);
  });
});

describe("lista de regalos · pedirse regalos", () => {
  it("quien regala ve la lista y quién se ha pedido cada cosa", async () => {
    const { game, miriam, ane, benat } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro", priceCents: 2000 }, noPreview);
    await claimWish(ane, w.id, false);
    const [list] = await getGiftLists(benat, game.id);
    expect(list.name).toBe("Miriam");
    expect(list.wishes[0]).toMatchObject({ title: "Libro", mine: false, joint: false, purchased: false });
    expect(list.wishes[0].claimers).toEqual([{ name: "Ane", avatar: expect.any(String), me: false, amountCents: null }]);
    const [mine] = await getGiftLists(ane, game.id);
    expect(mine.wishes[0]).toMatchObject({ mine: true });
    expect(await myClaims(ane, game.id)).toMatchObject([{ title: "Libro", forName: "Miriam", joint: false, priceCents: 2000 }]);
  });

  it("un regalo individual queda bloqueado para los demás; repetir no duplica", async () => {
    const { game, miriam, ane, benat } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await claimWish(ane, w.id, false);
    expect(await db.wishClaim.count()).toBe(1);
    await expect(claimWish(benat, w.id, false)).rejects.toThrow(/ya se lo ha pedido Ane/);
    await expect(claimWish(benat, w.id, true)).rejects.toThrow(/ya se lo ha pedido Ane/);
  });

  it("dos personas a la vez: solo una se lo queda", async () => {
    const { game, miriam, ane, benat, carla } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const r = await Promise.allSettled([claimWish(ane, w.id, false), claimWish(benat, w.id, false), claimWish(carla, w.id, false)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.wishClaim.count({ where: { wishId: w.id } })).toBe(1);
  });

  it("regalo entre varios: se suman, pero nadie se lo queda en solitario", async () => {
    const { game, miriam, ane, benat, carla } = await setup();
    const w = await addWish(miriam, game.id, { title: "Bici" }, noPreview);
    await claimWish(ane, w.id, true);
    await claimWish(benat, w.id, true);
    await expect(claimWish(carla, w.id, false)).rejects.toThrow(/entre varios/);
    const [list] = await getGiftLists(carla, game.id);
    expect(list.wishes[0]).toMatchObject({ joint: true, mine: false });
    expect(list.wishes[0].claimers.map((c) => c.name)).toEqual(["Ane", "Beñat"]);
  });

  it("solo quien se lo ha pedido marca comprado; al soltarlo todos se desmarca", async () => {
    const { game, miriam, ane, benat } = await setup();
    const w = await addWish(miriam, game.id, { title: "Bici" }, noPreview);
    await expect(setClaimPurchased(ane, w.id, true)).rejects.toThrow(/Solo quien/);
    await claimWish(ane, w.id, true);
    await claimWish(benat, w.id, true);
    await setClaimPurchased(benat, w.id, true);
    await unclaimWish(ane, w.id);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).purchased).toBe(true);
    await unclaimWish(benat, w.id);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).purchased).toBe(false);
    expect(await db.wishClaim.count()).toBe(0);
  });

  it("quien no está en la sala no ve ni se pide nada; quien solo organiza no se pide regalos", async () => {
    const { admin, game, miriam } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const fuera = await makeUser("Fuera");
    await expect(getGiftLists(fuera, game.id)).rejects.toThrow(/No participas/);
    await expect(claimWish(fuera, w.id, false)).rejects.toThrow(/No participas/);
    await expect(claimWish(admin, w.id, false)).rejects.toThrow(/apuntado/);
    expect(await getGiftLists(admin, game.id)).toHaveLength(1);
  });

  it("quien no recibe no tiene lista propia", async () => {
    const { game, ane } = await setup();
    await expect(addWish(ane, game.id, { title: "X" }, noPreview)).rejects.toThrow(/no tienes lista/);
  });

  it("si alguien se va de la sala, sus regalos quedan libres", async () => {
    const { game, miriam, ane, benat } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await leaveGame(ane, game.id);
    await claimWish(benat, w.id, false);
    expect(await db.wishClaim.count({ where: { wishId: w.id } })).toBe(1);
  });

  it("si alguien deja de recibir, se sueltan los regalos pedidos de su lista", async () => {
    const { admin, game, miriam, ane, miriamPid } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await setHonoree(admin, game.id, miriamPid, false);
    expect(await db.wishClaim.count()).toBe(0);
    expect(await getGiftLists(ane, game.id)).toHaveLength(0);
  });
});

describe("lista de regalos · quien recibe no se entera de nada", () => {
  it("su lista no dice quién se ha pedido qué ni qué está comprado", async () => {
    const { game, miriam, ane } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await setClaimPurchased(ane, w.id, true);
    const mine = await listMyWishes(miriam, game.id);
    expect(mine).toHaveLength(1);
    const json = JSON.stringify(mine);
    for (const leak of ["purchased", "claims", "claimers", "secret", "addedBy", "Ane"]) expect(json).not.toContain(leak);
    // Y su propia lista nunca aparece entre "las listas de los demás"
    expect(await getGiftLists(miriam, game.id)).toEqual([]);
    expect(await myClaims(miriam, game.id)).toEqual([]);
  });

  it("no puede pedirse ni marcar regalos de su propia lista", async () => {
    const { game, miriam } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await expect(claimWish(miriam, w.id, false)).rejects.toThrow(/no existe/);
    await expect(setClaimPurchased(miriam, w.id, true)).rejects.toThrow(/no existe/);
    await expect(unclaimWish(miriam, w.id)).rejects.toThrow(/no existe/);
  });

  it("las ideas secretas las ven los demás, nunca su destinataria", async () => {
    const { admin, game, miriam, ane, benat, miriamPid } = await setup();
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const secret = await addSecretWish(ane, game.id, miriamPid, { title: "Viaje sorpresa", links: ["https://a.com"] }, noPreview);
    await addSecretWish(admin, game.id, miriamPid, { title: "Cena" }, noPreview); // quien organiza también propone

    expect((await listMyWishes(miriam, game.id)).map((w) => w.title)).toEqual(["Libro"]);
    expect(await myListState(miriam, game.id)).toMatchObject({ wishCount: 1 });
    const rows = await listParticipantsForAdmin(admin, game.id);
    expect(rows.find((r) => r.name === "Miriam")!.wishCount).toBe(1);

    const [list] = await getGiftLists(benat, game.id);
    expect(list.wishes.map((w) => w.title).sort()).toEqual(["Cena", "Libro", "Viaje sorpresa"]);
    const seen = list.wishes.find((w) => w.id === secret.id)!;
    expect(seen).toMatchObject({ secret: true, addedByName: "Ane", canEdit: false });
    await claimWish(benat, secret.id, false);

    // Ni conociendo el id puede tocarla ni confirmar que existe
    await expect(updateWish(miriam, secret.id, { title: "hack" }, noPreview)).rejects.toThrow(/no es tuya/);
    await expect(deleteWish(miriam, secret.id)).rejects.toThrow(/no es tuya/);
    await expect(updateSecretWish(miriam, secret.id, { title: "hack" }, noPreview)).rejects.toThrow(/no existe/);
    await expect(deleteSecretWish(miriam, secret.id)).rejects.toThrow(/no existe/);
  });

  it("nadie propone ideas secretas en su propia lista, ni a quien no recibe", async () => {
    const { game, people, miriam, ane, miriamPid } = await setup();
    await expect(addSecretWish(miriam, game.id, miriamPid, { title: "X" }, noPreview)).rejects.toThrow(/Mi lista/);
    await expect(addSecretWish(ane, game.id, people[2].participantId, { title: "X" }, noPreview)).rejects.toThrow(/no tiene lista/);
  });

  it("aunque organice la sala, quien recibe no ve nada de su lista", async () => {
    const admin = await makeAdmin("Miriam Jefa");
    const game = await createGame(admin, { ...gameInput({ kind: "GIFT_LIST" }), joinAsParticipant: true, ownerIsHonoree: true });
    const ane = await makeUser("Ane");
    await joinGame(ane, game.joinToken);
    const me = await db.participant.findFirstOrThrow({ where: { gameId: game.id, userId: admin.id } });
    expect(me.honoree).toBe(true);
    await publishAll(game.id);
    const w = await addWish(admin, game.id, { title: "Libro" }, noPreview);
    const secret = await addSecretWish(ane, game.id, me.id, { title: "Sorpresa" }, noPreview);
    await claimWish(ane, w.id, false);
    expect(await getGiftLists(admin, game.id)).toEqual([]);
    expect((await listMyWishes(admin, game.id)).map((x) => x.title)).toEqual(["Libro"]);
    await expect(deleteSecretWish(admin, secret.id)).rejects.toThrow(/no existe/);
    expect((await listParticipantsForAdmin(admin, game.id)).find((r) => r.userId === admin.id)!.wishCount).toBe(1);
  });

  it("solo quien propuso la idea (o quien organiza) la edita o la borra", async () => {
    const { admin, game, miriam, ane, benat, miriamPid } = await setup();
    const own = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const secret = await addSecretWish(ane, game.id, miriamPid, { title: "Viaje" }, noPreview);
    await expect(updateSecretWish(benat, secret.id, { title: "X" }, noPreview)).rejects.toThrow(/Solo quien propuso/);
    await expect(deleteSecretWish(ane, own.id)).rejects.toThrow(/su dueño/);
    expect((await updateSecretWish(ane, secret.id, { title: "Viaje a Roma" }, noPreview)).title).toBe("Viaje a Roma");
    expect((await getGiftLists(admin, game.id))[0].wishes.find((w) => w.id === secret.id)!.canEdit).toBe(true);
    await deleteSecretWish(admin, secret.id);
    expect(await db.wish.count({ where: { secret: true } })).toBe(0);
  });

  it("copiar la lista a otra sala no arrastra las ideas secretas", async () => {
    const { admin, game, miriam, ane, miriamPid } = await setup();
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await addSecretWish(ane, game.id, miriamPid, { title: "Viaje sorpresa" }, noPreview);
    await finishGame(admin, game.id);
    const next = await createNextEdition(admin, game.id, "Cumple 2027");
    expect(await copyWishesFrom(miriam, next.id, game.id)).toBe(1);
    expect((await db.wish.findMany({ where: { participant: { gameId: next.id } } })).map((w) => w.title)).toEqual(["Libro"]);
  });

  it("si se borra la cuenta de quien propuso una idea, sigue siendo secreta", async () => {
    const { game, miriam, ane, miriamPid } = await setup();
    await addSecretWish(ane, game.id, miriamPid, { title: "Viaje sorpresa" }, noPreview);
    await db.user.delete({ where: { id: ane.id } });
    expect(await db.wish.findFirstOrThrow({ where: { secret: true } })).toMatchObject({ addedById: null, secret: true });
    expect(await listMyWishes(miriam, game.id)).toEqual([]);
  });

  it("su lista puede quedarse vacía (aquí no hay «sorpréndeme»)", async () => {
    const { game, miriam } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await deleteWish(miriam, w.id);
    expect(await db.wish.count()).toBe(0);
  });
});
