/** Chat anónimo entre quien regala y quien recibe. */
import type { ChatRole, User } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { notifyUser } from "../push";

async function roleIn(user: User, assignmentId: string): Promise<{ role: ChatRole; assignment: { id: string; gameId: string } }> {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { giver: true, receiver: true, game: true },
  });
  if (!a) throw new AppError("Conversación no encontrada.");
  if (!a.game.anonChat) throw new AppError("El chat anónimo está desactivado en esta sala.");
  if (a.giver.userId === user.id) return { role: "GIVER", assignment: a };
  if (a.receiver.userId === user.id) return { role: "RECEIVER", assignment: a };
  throw new AppError("Esta conversación no es tuya.");
}

export async function sendChatMessage(user: User, assignmentId: string, body: string) {
  const text = body.trim();
  if (!text) throw new AppError("Escribe un mensaje.");
  if (text.length > 1000) throw new AppError("Mensaje demasiado largo (máx. 1000).");
  const { role, assignment } = await roleIn(user, assignmentId);
  const game = await db.game.findUniqueOrThrow({ where: { id: assignment.gameId } });
  if (game.status !== "DRAWN") throw new AppError("El chat solo está disponible con el sorteo hecho.");
  return db.chatMessage.create({ data: { gameId: assignment.gameId, assignmentId, senderRole: role, body: text } });
}

/** Mensajes de una conversación. Quien recibe nunca ve el nombre de quien regala. */
export async function getChatThread(user: User, assignmentId: string) {
  const { role } = await roleIn(user, assignmentId);
  const a = await db.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { receiver: { include: { user: true } }, messages: { orderBy: { createdAt: "asc" }, take: 500 } },
  });
  return {
    role,
    otherName: role === "GIVER" ? a.receiver.user.name : "Tu amigo invisible",
    otherAvatar: role === "GIVER" ? a.receiver.user.avatar : "🎭",
    messages: a.messages.map((m) => ({ id: m.id, body: m.body, mine: m.senderRole === role, createdAt: m.createdAt })),
  };
}

/** Conversaciones de una sala: como quien regala y como quien recibe. */
export async function listMyChats(user: User, gameId: string) {
  const me = await db.participant.findUnique({ where: { gameId_userId: { gameId, userId: user.id } } });
  if (!me) return { asGiver: [], asReceiver: null as null | { assignmentId: string; count: number } };
  const giving = await db.assignment.findMany({
    where: { gameId, giverId: me.id },
    include: { receiver: { include: { user: true } }, _count: { select: { messages: true } } },
  });
  const receiving = await db.assignment.findFirst({
    where: { gameId, receiverId: me.id },
    include: { _count: { select: { messages: true } } },
  });
  return {
    asGiver: giving.map((a) => ({ assignmentId: a.id, name: a.receiver.user.name, avatar: a.receiver.user.avatar, count: a._count.messages })),
    asReceiver: receiving ? { assignmentId: receiving.id, count: receiving._count.messages } : null,
  };
}

function preview(text: string, max = 140) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/**
 * Aviso push al otro lado de la conversación. Quien recibe nunca ve el nombre
 * de quien regala; quien regala ve el nombre de la persona a la que regala.
 */
export async function notifyNewChatMessage(messageId: string): Promise<number> {
  const m = await db.chatMessage.findUnique({
    where: { id: messageId },
    include: { game: true, assignment: { include: { giver: true, receiver: { include: { user: true } } } } },
  });
  if (!m) return 0;
  const a = m.assignment;
  const url = `/sala/${m.gameId}/chat/${a.id}`;
  if (m.senderRole === "GIVER") {
    return notifyUser(a.receiver.userId, {
      title: "🎭 Tu amigo invisible te ha escrito",
      body: preview(m.body),
      url,
      tag: `chat-${a.id}`,
    });
  }
  return notifyUser(a.giver.userId, {
    title: `${a.receiver.user.avatar} ${a.receiver.user.name.split(" ")[0]} te ha respondido`,
    body: preview(m.body),
    url,
    tag: `chat-${a.id}`,
  });
}
