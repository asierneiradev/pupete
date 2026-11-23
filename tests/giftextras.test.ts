import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSubscription, sendTestPush, setPushSender } from "@/lib/push";
import { deleteUnusedUploads, saveUpload } from "@/lib/uploads";
import { createGame, createNextEdition, deleteGame, finishGame, setRevealGivers, updateGame } from "@/lib/services/games";
import { listParticipantsForAdmin, setHonoree } from "@/lib/services/participants";
import { addWish, listMyWishes } from "@/lib/services/wishes";
import { addSecretWish, claimWish, getGiftLists, getThanks, myClaims, setClaimAmount } from "@/lib/services/giftlist";
import {
  notifyJointJoined, notifySecretIdea, notifyThanksReady, notifyWishAdded, resetGiftNotifyThrottle, sendDueReminders,
} from "@/lib/services/giftnotify";
import { gameInput, gameWith, makeAdmin, noPreview, publishAll, userById } from "./helpers";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DAY = 86_400_000;
/** Mediodía en Madrid (los recordatorios solo salen de día) */
const NOON = new Date("2027-03-10T11:00:00Z");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

type Sent = { to: string; title: string; body: string; url: string };
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  resetGiftNotifyThrottle();
  setPushSender(async (t, payload) => {
    const p = JSON.parse(payload);
    sent.push({ to: t.endpoint.split("/").pop()!, title: p.title, body: p.body, url: p.url });
    return 201;
  });
});
afterEach(() => setPushSender(null));

/** Cumple de Miriam: ella recibe; Ane, Beñat y Carla regalan. Todos con avisos activados. */
async function setup(over: Parameters<typeof gameInput>[0] = {}) {
  const admin = await makeAdmin();
  const { game, people } = await gameWith(admin, [{ name: "Miriam" }, { name: "Ane" }, { name: "Beñat" }, { name: "Carla" }], {
    kind: "GIFT_LIST",
    name: "Cumple de Miriam",
    ...over,
  });
  const [miriam, ane, benat, carla] = await Promise.all(people.map((p) => userById(p.userId)));
  await setHonoree(admin, game.id, people[0].participantId, true);
  await publishAll(game.id);
  for (const [u, key] of [[miriam, "miriam"], [ane, "ane"], [benat, "benat"], [carla, "carla"]] as const) {
    await saveSubscription(u, { endpoint: `https://push.test/${key}`, keys: { p256dh: "p", auth: "a" } });
  }
  return { admin, game, people, miriam, ane, benat, carla, miriamPid: people[0].participantId };
}

const to = (who: string) => sent.filter((s) => s.to === who);

describe("bote común", () => {
  it("cada uno apunta lo que pone y los demás ven cuánto falta", async () => {
    const { game, miriam, ane, benat, carla } = await setup();
    const w = await addWish(miriam, game.id, { title: "Bici", priceCents: 150_00 }, noPreview);
    await claimWish(ane, w.id, true);
    await claimWish(benat, w.id, true);
    await setClaimAmount(ane, w.id, 60_00);
    await setClaimAmount(benat, w.id, 40_00);
    const [list] = await getGiftLists(carla, game.id);
    expect(list.wishes[0]).toMatchObject({ joint: true, potCents: 100_00, priceCents: 150_00 });
    expect(list.wishes[0].claimers.map((c) => [c.name, c.amountCents])).toEqual([["Ane", 60_00], ["Beñat", 40_00]]);
    expect((await myClaims(ane, game.id))[0]).toMatchObject({ joint: true, amountCents: 60_00 });
    await setClaimAmount(ane, w.id, null);
    expect((await getGiftLists(carla, game.id))[0].wishes[0].potCents).toBe(40_00);
  });

  it("solo en regalos entre varios, solo si estoy apuntado y con cantidades razonables", async () => {
    const { game, miriam, ane, benat, carla } = await setup();
    const solo = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const varios = await addWish(miriam, game.id, { title: "Bici" }, noPreview);
    await claimWish(ane, solo.id, false);
    await claimWish(benat, varios.id, true);
    await expect(setClaimAmount(ane, solo.id, 10_00)).rejects.toThrow(/entre varios/);
    await expect(setClaimAmount(carla, varios.id, 10_00)).rejects.toThrow(/apúntate/);
    await expect(setClaimAmount(benat, varios.id, -1)).rejects.toThrow(/no es válida/);
    await expect(setClaimAmount(benat, varios.id, 10.5)).rejects.toThrow(/no es válida/);
    // Quien recibe no puede ni tocar ni consultar el bote de su propia lista
    await expect(setClaimAmount(miriam, varios.id, 10_00)).rejects.toThrow(/no existe/);
    expect(JSON.stringify(await listMyWishes(miriam, game.id))).not.toMatch(/amount|pot|claim/i);
  });
});

describe("agradecimientos", () => {
  it("con la sala abierta, o cerrada sin activarlos, quien recibe no ve nada", async () => {
    const { admin, game, miriam, ane } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    expect(await getThanks(miriam, game.id)).toBeNull();
    await finishGame(admin, game.id);
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).revealGivers).toBe(false);
    expect(await getThanks(miriam, game.id)).toBeNull();
  });

  it("al cerrar con agradecimientos ve quién regaló qué (también las sorpresas), sin importes", async () => {
    const { admin, game, miriam, ane, benat, carla, miriamPid } = await setup();
    const libro = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const bici = await addWish(miriam, game.id, { title: "Bici", priceCents: 150_00 }, noPreview);
    await addWish(miriam, game.id, { title: "Nadie me lo regaló" }, noPreview);
    const viaje = await addSecretWish(ane, game.id, miriamPid, { title: "Viaje sorpresa" }, noPreview);
    await claimWish(ane, libro.id, false);
    await claimWish(benat, bici.id, true);
    await claimWish(carla, bici.id, true);
    await setClaimAmount(benat, bici.id, 77_00);
    await claimWish(carla, viaje.id, false);
    await finishGame(admin, game.id, { revealGivers: true });
    const thanks = (await getThanks(miriam, game.id))!;
    expect(thanks.map((t) => [t.title, t.surprise, t.givers.map((g) => g.name)])).toEqual([
      ["Libro", false, ["Ane"]],
      ["Bici", false, ["Beñat", "Carla"]],
      ["Viaje sorpresa", true, ["Carla"]],
    ]);
    expect(JSON.stringify(thanks)).not.toMatch(/7700|amount/);
    // Quien no recibe no tiene agradecimientos; se pueden volver a ocultar
    expect(await getThanks(ane, game.id)).toBeNull();
    await setRevealGivers(admin, game.id, false);
    expect(await getThanks(miriam, game.id)).toBeNull();
  });

  it("nunca antes de la fecha de la celebración, aunque la sala se cierre pronto", async () => {
    const { admin, game, miriam, ane } = await setup({ eventDate: new Date(Date.now() + 5 * DAY) });
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await finishGame(admin, game.id, { revealGivers: true });
    expect(await getThanks(miriam, game.id)).toBeNull();
    expect(await notifyThanksReady(game.id)).toBe(0);
    expect(await getThanks(miriam, game.id, new Date(Date.now() + 6 * DAY))).toHaveLength(1);
  });

  it("solo se activan en listas de regalos ya cerradas, y el amigo invisible no cambia", async () => {
    const { admin, game } = await setup();
    await expect(setRevealGivers(admin, game.id, true)).rejects.toThrow(/cierra la sala/);
    const santa = await gameWith(admin, [{ name: "X1" }, { name: "X2" }, { name: "X3" }]);
    await expect(setRevealGivers(admin, santa.game.id, true)).rejects.toThrow(/lista de regalos/);
  });

  it("avisa a quien recibe de que ya puede verlos", async () => {
    const { admin, game, miriam, ane } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await finishGame(admin, game.id, { revealGivers: true });
    expect(await notifyThanksReady(game.id)).toBe(1);
    expect(sent.map((s) => s.to)).toEqual(["miriam"]);
  });
});

describe("avisos de la lista", () => {
  it("cuando quien recibe añade algo se avisa a los demás, una vez cada media hora", async () => {
    const { game, miriam } = await setup();
    const a = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const b = await addWish(miriam, game.id, { title: "Bufanda" }, noPreview);
    const t0 = Date.now();
    expect(await notifyWishAdded(a.id, t0)).toBe(3);
    expect(await notifyWishAdded(b.id, t0 + 60_000)).toBe(0);
    expect(sent.map((s) => s.to).sort()).toEqual(["ane", "benat", "carla"]);
    expect(sent[0].title).toMatch(/Miriam ha añadido/);
    expect(await notifyWishAdded(b.id, t0 + 31 * 60_000)).toBe(3);
  });

  it("una idea secreta se avisa a los demás que regalan, NUNCA a quien recibe", async () => {
    const { game, ane, miriamPid } = await setup();
    const idea = await addSecretWish(ane, game.id, miriamPid, { title: "Viaje sorpresa a Roma" }, noPreview);
    expect(await notifySecretIdea(idea.id)).toBe(2);
    expect(sent.map((s) => s.to).sort()).toEqual(["benat", "carla"]);
    // Y por la vía de "ha añadido algo" tampoco sale una idea secreta
    expect(await notifyWishAdded(idea.id)).toBe(0);
    expect(to("miriam")).toHaveLength(0);
  });

  it("al sumarse a un regalo entre varios se avisa a quienes ya estaban", async () => {
    const { game, miriam, ane, benat, carla } = await setup();
    const w = await addWish(miriam, game.id, { title: "Bici" }, noPreview);
    expect(await claimWish(ane, w.id, true)).toEqual({ joined: false });
    expect(await claimWish(benat, w.id, true)).toEqual({ joined: true });
    expect(await notifyJointJoined(w.id, benat.id)).toBe(1);
    await claimWish(carla, w.id, true);
    await notifyJointJoined(w.id, carla.id);
    expect(sent.map((s) => s.to).sort()).toEqual(["ane", "ane", "benat"]);
    expect(to("miriam")).toHaveLength(0);
  });

  it("no hay avisos en salas cerradas ni de amigo invisible", async () => {
    const { admin, game, miriam } = await setup();
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await finishGame(admin, game.id);
    expect(await notifyWishAdded(w.id)).toBe(0);
    const santa = await gameWith(admin, [{ name: "X1" }, { name: "X2" }, { name: "X3" }]);
    const sw = await addWish(await userById(santa.people[0].userId), santa.game.id, { title: "Calcetines" }, noPreview);
    expect(await notifyWishAdded(sw.id)).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe("recordatorios", () => {
  it("a 7, 3 y 1 días, una sola vez cada uno, y a quien recibe nada sobre su lista", async () => {
    const { game, miriam, ane, miriamPid } = await setup({ eventDate: new Date(NOON.getTime() + 6.5 * DAY) });
    const libro = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await addWish(miriam, game.id, { title: "Bufanda" }, noPreview);
    await addSecretWish(ane, game.id, miriamPid, { title: "Viaje" }, noPreview);
    await claimWish(ane, libro.id, false);

    expect(await sendDueReminders(NOON)).toBe(3);
    expect(to("miriam")).toHaveLength(0);
    expect(to("ane")[0]).toMatchObject({ title: "⏰ Quedan 7 días · Cumple de Miriam", body: "Hay 2 regalos sin pedir. Te queda 1 por comprar." });
    expect(to("benat")[0].body).toBe("Hay 2 regalos sin pedir.");
    // La misma pasada otra vez (o al día siguiente) no repite
    expect(await sendDueReminders(NOON)).toBe(0);
    expect(await sendDueReminders(new Date(NOON.getTime() + DAY))).toBe(0);
    // A 3 días y a 1 día vuelve a salir
    sent = [];
    expect(await sendDueReminders(new Date(NOON.getTime() + 4 * DAY))).toBe(3);
    expect(to("carla")[0].title).toBe("⏰ Quedan 3 días · Cumple de Miriam");
    expect(await sendDueReminders(new Date(NOON.getTime() + 6 * DAY))).toBe(3);
    expect(sent.at(-1)!.title).toBe("⏰ Queda 1 día · Cumple de Miriam");
    expect(sent.some((s) => s.to === "miriam")).toBe(false);
    for (const s of sent) expect(s.body).not.toMatch(/Viaje/);
  });

  it("si está todo pedido y comprado no molesta; a quien recibe con la lista vacía le pide ideas", async () => {
    const { game, miriam, ane } = await setup({ eventDate: new Date(NOON.getTime() + 2.5 * DAY) });
    expect(await sendDueReminders(NOON)).toBe(1);
    expect(sent[0]).toMatchObject({ to: "miriam", body: expect.stringMatching(/Tu lista está vacía/) });
    const w = await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    await claimWish(ane, w.id, false);
    await db.wish.update({ where: { id: w.id }, data: { purchased: true } });
    sent = [];
    expect(await sendDueReminders(new Date(NOON.getTime() + 2 * DAY))).toBe(0);
  });

  it("de noche no se envía, y se guarda para la mañana", async () => {
    const { game, miriam } = await setup({ eventDate: new Date(NOON.getTime() + 2.5 * DAY) });
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    const night = new Date("2027-03-10T02:00:00Z");
    expect(await sendDueReminders(night)).toBe(0);
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).lastReminderDays).toBeNull();
    expect(await sendDueReminders(NOON)).toBe(3);
  });

  it("al cambiar la fecha vuelven a empezar; salas cerradas, pasadas o de amigo invisible no reciben", async () => {
    const { admin, game, miriam } = await setup({ eventDate: new Date(NOON.getTime() + 0.5 * DAY) });
    await addWish(miriam, game.id, { title: "Libro" }, noPreview);
    expect(await sendDueReminders(NOON)).toBe(3);
    await updateGame(admin, game.id, gameInput({ kind: "GIFT_LIST", name: "Cumple de Miriam", eventDate: new Date(NOON.getTime() + 2.5 * DAY) }));
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).lastReminderDays).toBeNull();
    expect(await sendDueReminders(NOON)).toBe(3);
    await finishGame(admin, game.id);
    await db.game.update({ where: { id: game.id }, data: { lastReminderDays: null } });
    await gameWith(admin, [{ name: "X1" }, { name: "X2" }, { name: "X3" }], { eventDate: new Date(NOON.getTime() + 2 * DAY) });
    sent = [];
    expect(await sendDueReminders(NOON)).toBe(0);
    expect(await sendDueReminders(new Date(NOON.getTime() + 30 * DAY))).toBe(0);
  });

  it("«todos con todos»: cada uno recibe el recuento de las listas de los demás, no de la suya", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [{ name: "Ane" }, { name: "Beñat" }], {
      kind: "GIFT_LIST", allHonorees: true, name: "Reyes", eventDate: new Date(NOON.getTime() + 2.5 * DAY),
    });
    const [ane, benat] = await Promise.all(people.map((p) => userById(p.userId)));
    await saveSubscription(ane, { endpoint: "https://push.test/ane", keys: { p256dh: "p", auth: "a" } });
    await saveSubscription(benat, { endpoint: "https://push.test/benat", keys: { p256dh: "p", auth: "a" } });
    await publishAll(game.id);
    await addWish(ane, game.id, { title: "A1" }, noPreview);
    await addWish(ane, game.id, { title: "A2" }, noPreview);
    await addWish(benat, game.id, { title: "B1" }, noPreview);
    await sendDueReminders(NOON);
    expect(to("ane")[0].body).toBe("Hay 1 regalo sin pedir.");
    expect(to("benat")[0].body).toBe("Hay 2 regalos sin pedir.");
  });
});

describe("portada con foto propia", () => {
  it("se guarda, se cambia, se quita y el fichero se borra cuando ya no se usa", async () => {
    const admin = await makeAdmin();
    const exists = (url: string) => readFile(path.join(process.env.UPLOAD_DIR!, url.split("/").pop()!)).then(() => true, () => false);
    const foto = await saveUpload(PNG);
    const game = await createGame(admin, gameInput({ coverImage: foto }));
    expect(game.coverImage).toBe(foto);
    // Guardar la configuración sin tocar la foto la conserva
    expect((await updateGame(admin, game.id, gameInput({ name: "Otro nombre" }))).coverImage).toBe(foto);
    // Una foto de portada en uso no se borra aunque ninguna idea la use
    expect(await deleteUnusedUploads([foto])).toBe(0);
    const otra = await saveUpload(PNG);
    expect((await updateGame(admin, game.id, gameInput({ coverImage: otra }))).coverImage).toBe(otra);
    expect(await exists(foto)).toBe(false);
    expect((await updateGame(admin, game.id, gameInput({ coverImage: null }))).coverImage).toBeNull();
    expect(await exists(otra)).toBe(false);
  });

  it("solo admite fotos subidas a Pupete, y la nueva edición la comparte", async () => {
    const admin = await makeAdmin();
    await expect(createGame(admin, gameInput({ coverImage: "https://malo.test/x.jpg" }))).rejects.toThrow(/no es válida/);
    const foto = await saveUpload(PNG);
    const { game } = await gameWith(admin, [{ name: "A" }, { name: "B" }, { name: "C" }], { kind: "GIFT_LIST", coverImage: foto, name: "Cumple" });
    await finishGame(admin, game.id);
    const next = await createNextEdition(admin, game.id, "Cumple 2");
    expect(next.coverImage).toBe(foto);
    await deleteGame(admin, game.id, "Cumple");
    // Sigue en uso por la nueva edición
    expect(await deleteUnusedUploads([foto])).toBe(0);
    await deleteGame(admin, next.id, "Cumple 2");
    expect(await deleteUnusedUploads([foto])).toBe(0); // ya se borró con la sala
  });
});

describe("diagnóstico de avisos", () => {
  it("aviso de prueba: dice a cuántos dispositivos llega, y quien organiza ve quién tiene avisos", async () => {
    const { admin, game, ane } = await setup();
    expect(await sendTestPush(ane)).toEqual({ devices: 1, sent: 1 });
    expect(sent[0]).toMatchObject({ to: "ane", title: expect.stringMatching(/prueba/) });
    await expect(sendTestPush(admin)).rejects.toThrow(/ningún dispositivo/);
    setPushSender(async () => 403);
    expect(await sendTestPush(ane)).toEqual({ devices: 1, sent: 0 });
    const rows = await listParticipantsForAdmin(admin, game.id);
    expect(rows.every((r) => r.pushOn)).toBe(true);
    await db.pushSubscription.deleteMany({ where: { userId: ane.id } });
    expect((await listParticipantsForAdmin(admin, game.id)).find((r) => r.name === "Ane")!.pushOn).toBe(false);
  });
});
