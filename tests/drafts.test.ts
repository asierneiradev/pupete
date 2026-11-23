import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSubscription, setPushSender } from "@/lib/push";
import { finishGame } from "@/lib/services/games";
import { listParticipantsForAdmin, setHonoree } from "@/lib/services/participants";
import { addWish, listMyWishes, publishMyList } from "@/lib/services/wishes";
import { addSecretWish, claimWish, getGiftLists, setClaimPurchased } from "@/lib/services/giftlist";
import { notifyListPublished, notifyWishAdded, resetGiftNotifyThrottle, sendDueReminders } from "@/lib/services/giftnotify";
import { gameWith, makeAdmin, noPreview, userById } from "./helpers";

const DAY = 86_400_000;
const NOON = new Date("2027-03-10T11:00:00Z");

type Sent = { to: string; title: string; body: string };
let sent: Sent[] = [];
beforeEach(() => {
  sent = [];
  resetGiftNotifyThrottle();
  setPushSender(async (t, payload) => {
    const p = JSON.parse(payload);
    sent.push({ to: t.endpoint.split("/").pop()!, title: p.title, body: p.body });
    return 201;
  });
});
afterEach(() => setPushSender(null));

/** Cumple de Miriam, recién creado: su lista todavía es un borrador. */
async function setup(over: Record<string, unknown> = {}) {
  const admin = await makeAdmin();
  const { game, people } = await gameWith(admin, [{ name: "Miriam" }, { name: "Ane" }, { name: "Beñat" }], { kind: "GIFT_LIST", name: "Cumple de Miriam", ...over });
  const [miriam, ane, benat] = await Promise.all(people.map((p) => userById(p.userId)));
  await setHonoree(admin, game.id, people[0].participantId, true);
  for (const [u, key] of [[miriam, "miriam"], [ane, "ane"], [benat, "benat"]] as const) {
    await saveSubscription(u, { endpoint: `https://push.test/${key}`, keys: { p256dh: "p", auth: "a" } });
  }
  return { admin, game, miriam, ane, benat, miriamPid: people[0].participantId };
}

describe("lista en borrador", () => {
  it("hasta que se publica solo la ve su dueña: ni los demás ni quien organiza", async () => {
    const { admin, game, miriam, ane } = await setup();
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await addWish(miriam, game.id, { title: "Bufanda" }, noPreview);
    expect((await listMyWishes(miriam, game.id)).map((w) => w.title).sort()).toEqual(["Bufanda", "Libro"]);
    for (const viewer of [ane, admin]) {
      const [list] = await getGiftLists(viewer, game.id);
      expect(list).toMatchObject({ name: "Miriam", published: false, wishes: [] });
    }
    const row = (await listParticipantsForAdmin(admin, game.id)).find((p) => p.name === "Miriam")!;
    expect(row.listDraft).toBe(true);
  });

  it("nadie puede pedirse ni marcar un regalo de una lista sin publicar", async () => {
    const { game, miriam, ane } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await expect(claimWish(ane, w.id, false)).rejects.toThrow(/no existe/);
    await expect(setClaimPurchased(ane, w.id, true)).rejects.toThrow(/no existe/);
    expect(await db.wishClaim.count()).toBe(0);
  });

  it("al publicarla la ven todos, se pueden pedir regalos y lo que añada después sale directamente", async () => {
    const { admin, game, miriam, ane } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    expect(await publishMyList(miriam, game.id)).toMatchObject({ published: true });
    const [list] = await getGiftLists(ane, game.id);
    expect(list.published).toBe(true);
    expect(list.wishes.map((x) => x.title)).toEqual(["Libro"]);
    await claimWish(ane, w.id, false);
    await addWish(miriam, game.id, { title: "Bufanda" }, noPreview);
    expect((await getGiftLists(ane, game.id))[0].wishes).toHaveLength(2);
    expect((await listParticipantsForAdmin(admin, game.id)).find((p) => p.name === "Miriam")!.listDraft).toBe(false);
    // Publicar otra vez no hace nada
    expect(await publishMyList(miriam, game.id)).toMatchObject({ published: false });
  });

  it("no se publica vacía, ni la de otro, ni en una sala cerrada o de amigo invisible", async () => {
    const { admin, game, miriam, ane } = await setup();
    await expect(publishMyList(miriam, game.id)).rejects.toThrow(/al menos una idea/);
    await expect(publishMyList(ane, game.id)).rejects.toThrow(/no tienes lista/);
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await finishGame(admin, game.id);
    await expect(publishMyList(miriam, game.id)).rejects.toThrow(/cerrada/);
    const santa = await gameWith(admin, [{ name: "Xabi" }, { name: "Yon" }, { name: "Zuri" }], { name: "Navidad" });
    await expect(publishMyList(await userById(santa.people[0].userId), santa.game.id)).rejects.toThrow(/no tienes lista/);
  });

  it("las ideas que proponen los demás funcionan aunque la lista siga en borrador", async () => {
    const { game, miriam, ane, benat, miriamPid } = await setup();
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const idea = await addSecretWish(ane, game.id, miriamPid, { title: "Viaje sorpresa" }, noPreview);
    const [list] = await getGiftLists(benat, game.id);
    expect(list.wishes.map((w) => w.title)).toEqual(["Viaje sorpresa"]);
    await claimWish(benat, idea.id, false);
    expect((await listMyWishes(miriam, game.id)).map((w) => w.title)).toEqual(["Libro"]);
  });

  it("no se avisa de lo que se añade a un borrador; al publicar llega un único aviso a los demás", async () => {
    const { game, miriam, miriamPid } = await setup();
    const a = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    expect(await notifyWishAdded(a.id)).toBe(0);
    expect(await notifyListPublished(miriamPid)).toBe(0);
    await publishMyList(miriam, game.id);
    expect(await notifyListPublished(miriamPid)).toBe(2);
    expect(sent.map((s) => s.to).sort()).toEqual(["ane", "benat"]);
    expect(sent[0]).toMatchObject({ title: "🎁 Miriam ha publicado su lista", body: "1 idea · Cumple de Miriam" });
    // Lo que añade justo después no vuelve a sonar
    const b = await addWish(miriam, game.id, { title: "Bufanda" }, noPreview);
    expect(await notifyWishAdded(b.id)).toBe(0);
  });

  it("recordatorios: un borrador no cuenta como regalos sin pedir y a su dueña se le recuerda publicarlo", async () => {
    const { game, miriam } = await setup({ eventDate: new Date(NOON.getTime() + 2.5 * DAY) });
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await sendDueReminders(NOON);
    expect(sent).toEqual([expect.objectContaining({ to: "miriam", body: "Tu lista sigue en borrador: publícala para que los demás la vean." })]);
  });

  it("migración: las listas que ya existían quedan publicadas", async () => {
    const { game, miriam, ane, miriamPid } = await setup();
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    // Lo mismo que hace la migración 20261123090100_list_draft con los datos existentes
    await db.$executeRawUnsafe(`UPDATE "Participant" SET "listPublishedAt" = "joinedAt"`);
    const p = await db.participant.findUniqueOrThrow({ where: { id: miriamPid } });
    expect(p.listPublishedAt).toEqual(p.joinedAt);
    expect((await getGiftLists(ane, game.id))[0].wishes.map((w) => w.title)).toEqual(["Libro"]);
  });
});
