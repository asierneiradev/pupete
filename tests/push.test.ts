import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notifyUser, removeSubscription, saveSubscription, setPushSender, type PushTarget } from "@/lib/push";
import { notifyNewChatMessage, sendChatMessage } from "@/lib/services/chat";
import { performDraw } from "@/lib/services/drawing";
import { gameWith, makeAdmin, makeUser, userById } from "./helpers";

const sub = (n: number) => ({ endpoint: `https://push.test/ep/${n}`, keys: { p256dh: `p256-${n}`, auth: `auth-${n}` } });

let sent: Array<{ endpoint: string; payload: Record<string, string> }> = [];
let status = 201;

beforeEach(() => {
  sent = [];
  status = 201;
  setPushSender(async (t: PushTarget, payload: string) => {
    sent.push({ endpoint: t.endpoint, payload: JSON.parse(payload) });
    return status;
  });
});
afterEach(() => setPushSender(null));

describe("suscripciones push", () => {
  it("guarda, reasigna al cambiar de usuario y borra", async () => {
    const a = await makeUser("Ane");
    const b = await makeUser("Beñat");
    await saveSubscription(a, sub(1), "Firefox");
    await saveSubscription(a, sub(1), "Firefox"); // idempotente
    expect(await db.pushSubscription.count({ where: { userId: a.id } })).toBe(1);
    await saveSubscription(b, sub(1));
    expect(await db.pushSubscription.count({ where: { userId: a.id } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { userId: b.id } })).toBe(1);
    await removeSubscription(a, sub(1).endpoint); // no es suya: no la toca
    expect(await db.pushSubscription.count()).toBe(1);
    await removeSubscription(b, sub(1).endpoint);
    expect(await db.pushSubscription.count()).toBe(0);
  });

  it("rechaza suscripciones mal formadas", async () => {
    const a = await makeUser("Ane");
    await expect(saveSubscription(a, null)).rejects.toThrow(/no válida/);
    await expect(saveSubscription(a, { endpoint: "http://inseguro.test", keys: { p256dh: "x", auth: "y" } })).rejects.toThrow(/no válida/);
    await expect(saveSubscription(a, { endpoint: "https://push.test/x", keys: {} })).rejects.toThrow(/no válida/);
  });

  it("limita los dispositivos por persona", async () => {
    const a = await makeUser("Ane");
    for (let i = 0; i < 12; i++) await saveSubscription(a, sub(i));
    expect(await db.pushSubscription.count({ where: { userId: a.id } })).toBe(10);
  });

  it("envía a todos los dispositivos y limpia los caducados", async () => {
    const a = await makeUser("Ane");
    await saveSubscription(a, sub(1));
    await saveSubscription(a, sub(2));
    expect(await notifyUser(a.id, { title: "Hola", body: "x", url: "/" })).toBe(2);
    expect(sent).toHaveLength(2);
    status = 410;
    expect(await notifyUser(a.id, { title: "Hola", body: "x", url: "/" })).toBe(0);
    expect(await db.pushSubscription.count()).toBe(0);
  });

  it("un fallo de red no rompe nada", async () => {
    const a = await makeUser("Ane");
    await saveSubscription(a, sub(1));
    setPushSender(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await notifyUser(a.id, { title: "Hola", body: "x", url: "/" })).toBe(0);
    expect(await db.pushSubscription.count()).toBe(1);
  });
});

describe("avisos del buzón secreto", () => {
  async function drawn() {
    const admin = await makeAdmin();
    const { game } = await gameWith(admin, [{ name: "Ane Etxeberria" }, { name: "Beñat" }, { name: "Carla" }]);
    await performDraw(admin, game.id);
    const a = await db.assignment.findFirstOrThrow({ where: { gameId: game.id }, include: { giver: true, receiver: true } });
    const giver = await userById(a.giver.userId);
    const receiver = await userById(a.receiver.userId);
    await saveSubscription(giver, sub(1));
    await saveSubscription(receiver, sub(2));
    return { game, a, giver, receiver };
  }

  it("quien recibe se entera sin saber quién le escribe", async () => {
    const { game, a, giver } = await drawn();
    const m = await sendChatMessage(giver, a.id, "¿Qué   talla\nusas?");
    expect(await notifyNewChatMessage(m.id)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe(sub(2).endpoint);
    expect(sent[0].payload).toEqual({
      title: "🎭 Tu amigo invisible te ha escrito",
      body: "¿Qué talla usas?",
      url: `/sala/${game.id}/chat/${a.id}`,
      tag: `chat-${a.id}`,
    });
    expect(JSON.stringify(sent[0].payload)).not.toContain(giver.name);
  });

  it("quien regala se entera de la respuesta", async () => {
    const { a, receiver } = await drawn();
    const m = await sendChatMessage(receiver, a.id, "x".repeat(300));
    await notifyNewChatMessage(m.id);
    expect(sent[0].endpoint).toBe(sub(1).endpoint);
    expect(sent[0].payload.title).toContain(receiver.name.split(" ")[0]);
    expect(sent[0].payload.title).toContain("te ha respondido");
    expect(sent[0].payload.body.length).toBeLessThanOrEqual(140);
  });
});
