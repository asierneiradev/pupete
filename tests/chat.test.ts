import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getChatThread, listMyChats, sendChatMessage } from "@/lib/services/chat";
import { performDraw } from "@/lib/services/drawing";
import { gameWith, makeAdmin, userById } from "./helpers";

async function drawn(anonChat = true) {
  const admin = await makeAdmin();
  const { game, people } = await gameWith(admin, [{ name: "Ane" }, { name: "Beñat" }, { name: "Carla" }, { name: "Dani" }], { anonChat });
  await performDraw(admin, game.id);
  const a = await db.assignment.findFirstOrThrow({ where: { gameId: game.id }, include: { giver: true, receiver: true } });
  const giver = await userById(a.giver.userId);
  const receiver = await userById(a.receiver.userId);
  const outsiderP = people.find((p) => p.userId !== giver.id && p.userId !== receiver.id)!;
  const outsider = await userById(outsiderP.userId);
  return { game, a, giver, receiver, outsider };
}

describe("chat anónimo", () => {
  it("quien regala pregunta y quien recibe responde sin saber quién es", async () => {
    const { a, giver, receiver } = await drawn();
    await sendChatMessage(giver, a.id, "¿Qué talla de camiseta usas?");
    await sendChatMessage(receiver, a.id, "La M, ¡gracias!");
    const forGiver = await getChatThread(giver, a.id);
    expect(forGiver.otherName).toBe(receiver.name);
    expect(forGiver.messages.map((m) => [m.body, m.mine])).toEqual([["¿Qué talla de camiseta usas?", true], ["La M, ¡gracias!", false]]);
    const forReceiver = await getChatThread(receiver, a.id);
    expect(forReceiver.otherName).toBe("Tu amigo invisible");
    expect(JSON.stringify(forReceiver)).not.toContain(giver.name);
    expect(forReceiver.messages[0].mine).toBe(false);
  });

  it("nadie más puede leer ni escribir", async () => {
    const { a, outsider } = await drawn();
    await expect(getChatThread(outsider, a.id)).rejects.toThrow(/no es tuya/);
    await expect(sendChatMessage(outsider, a.id, "hola")).rejects.toThrow(/no es tuya/);
  });

  it("valida el mensaje y respeta la configuración de la sala", async () => {
    const { a, giver } = await drawn();
    await expect(sendChatMessage(giver, a.id, "   ")).rejects.toThrow(/Escribe/);
    await expect(sendChatMessage(giver, a.id, "x".repeat(1001))).rejects.toThrow(/largo/);
    const off = await drawn(false);
    await expect(sendChatMessage(off.giver, off.a.id, "hola")).rejects.toThrow(/desactivado/);
  });

  it("lista mis conversaciones como regalador y como receptor", async () => {
    const { game, a, giver, receiver } = await drawn();
    await sendChatMessage(giver, a.id, "hola");
    const g = await listMyChats(giver, game.id);
    expect(g.asGiver).toEqual([expect.objectContaining({ assignmentId: a.id, name: receiver.name, count: 1 })]);
    const r = await listMyChats(receiver, game.id);
    expect(r.asReceiver).toEqual({ assignmentId: a.id, count: 1 });
  });

  it("tras cerrar la sala ya no se puede escribir", async () => {
    const { game, a, giver } = await drawn();
    await db.game.update({ where: { id: game.id }, data: { status: "FINISHED" } });
    await expect(sendChatMessage(giver, a.id, "hola")).rejects.toThrow(/sorteo hecho/);
  });
});
