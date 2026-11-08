/** Participantes: alta por el admin, registro con invitación, grupos y exclusiones. */
import type { AgeGroup, Game, User } from "@prisma/client";
import { db } from "../db";
import { appUrl } from "../env";
import { AppError } from "../errors";
import { createUser, nameKey, revealLoginCode, validatePin } from "./auth";
import { getManagedGame } from "./games";
import { deleteUnusedUploads } from "../uploads";

const MAX_PARTICIPANTS = 150;

function assertOpen(game: Game) {
  if (game.status !== "OPEN") throw new AppError("El sorteo ya se ha hecho: no se pueden cambiar participantes. Deshaz el sorteo si hace falta.");
}

async function assertCapacity(gameId: string) {
  if ((await db.participant.count({ where: { gameId } })) >= MAX_PARTICIPANTS) {
    throw new AppError(`Una sala admite como máximo ${MAX_PARTICIPANTS} participantes.`);
  }
}

export function joinUrl(game: Pick<Game, "joinToken">): string {
  return `${appUrl()}/unirse/${game.joinToken}`;
}

/**
 * El admin añade a una persona: nueva (se le genera código) o una cuenta ya
 * existente (p. ej. de otra edición).
 */
export async function addParticipantByAdmin(
  actor: User,
  gameId: string,
  input: { name?: string; group?: AgeGroup; existingUserId?: string },
): Promise<{ participantId: string; userId: string; code?: string }> {
  const game = await getManagedGame(actor, gameId);
  assertOpen(game);
  if (game.signupMode === "INVITE") {
    throw new AppError("Esta sala está configurada para que cada persona se registre con la invitación.");
  }
  await assertCapacity(game.id);
  const group: AgeGroup = input.group === "CHILD" ? "CHILD" : "ADULT";

  let userId: string;
  let code: string | undefined;
  if (input.existingUserId) {
    const u = await db.user.findUnique({ where: { id: input.existingUserId } });
    if (!u) throw new AppError("Esa persona no existe.");
    userId = u.id;
  } else {
    const same = await db.user.findUnique({ where: { nameKey: nameKey(input.name) }, select: { name: true } });
    if (same) {
      throw new AppError(
        `Ya hay alguien en Pupete que se llama «${same.name}». Si es la misma persona, elígela en la pestaña «De otras salas». Si no, añade el apellido o una inicial.`,
      );
    }
    const created = await createUser({ name: input.name ?? "" });
    userId = created.user.id;
    code = created.code;
  }
  if (await db.participant.findUnique({ where: { gameId_userId: { gameId: game.id, userId } } })) {
    throw new AppError("Esa persona ya está en la sala.");
  }
  const p = await db.participant.create({ data: { gameId: game.id, userId, group } });
  return { participantId: p.id, userId, code };
}

export async function getGameByJoinToken(token: string) {
  const game = await db.game.findUnique({
    where: { joinToken: token },
    include: { owner: { select: { name: true } }, _count: { select: { participants: true } } },
  });
  if (!game) return null;
  return game;
}

function assertJoinable(game: Game) {
  if (!game.joinOpen) throw new AppError("La inscripción a esta sala está cerrada. Pide al organizador que la abra.");
  if (game.signupMode === "ADMIN_CREATED") {
    throw new AppError("En esta sala el organizador da de alta a cada persona. Pídele tu código.");
  }
  assertOpen(game);
}

/** Un usuario ya registrado se une con el enlace de invitación. */
export async function joinGame(user: User, token: string, group?: AgeGroup) {
  const game = await db.game.findUnique({ where: { joinToken: token } });
  if (!game) throw new AppError("La invitación no es válida o ha caducado.");
  const existing = await db.participant.findUnique({ where: { gameId_userId: { gameId: game.id, userId: user.id } } });
  if (existing) return { game, participant: existing, already: true };
  assertJoinable(game);
  await assertCapacity(game.id);
  const participant = await db.participant.create({
    data: { gameId: game.id, userId: user.id, group: group === "CHILD" ? "CHILD" : "ADULT" },
  });
  return { game, participant, already: false };
}

/** Persona nueva: crea su cuenta y se une a la sala en un solo paso. */
export async function registerAndJoin(
  token: string,
  input: { name: string; pin: string; repeat: string; group?: AgeGroup },
) {
  const game = await db.game.findUnique({ where: { joinToken: token } });
  if (!game) throw new AppError("La invitación no es válida o ha caducado.");
  assertJoinable(game);
  await assertCapacity(game.id);
  const same = await db.user.findUnique({ where: { nameKey: nameKey(input.name) }, select: { name: true } });
  if (same) {
    throw new AppError(
      `Ya hay alguien en Pupete que se llama «${same.name}». Si eres tú, entra con tu nombre y tu PIN y vuelve a abrir la invitación. Si no, añade el apellido o una inicial.`,
    );
  }
  const pin = validatePin(input.pin, input.repeat);
  const { user, code } = await createUser({ name: input.name, pin });
  const participant = await db.participant.create({
    data: { gameId: game.id, userId: user.id, group: input.group === "CHILD" ? "CHILD" : "ADULT" },
  });
  return { game, user, code, participant };
}

export async function removeParticipant(actor: User, gameId: string, participantId: string): Promise<void> {
  const game = await getManagedGame(actor, gameId);
  assertOpen(game);
  const p = await db.participant.findUnique({ where: { id: participantId } });
  if (!p || p.gameId !== game.id) throw new AppError("Ese participante no está en la sala.");
  const photos = await db.wish.findMany({ where: { participantId: p.id }, select: { imageUrl: true } });
  await db.participant.delete({ where: { id: p.id } });
  await deleteUnusedUploads(photos.map((w) => w.imageUrl));
}

/** Un participante se sale por su cuenta (antes del sorteo). */
export async function leaveGame(user: User, gameId: string): Promise<void> {
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError("La sala no existe.");
  assertOpen(game);
  const photos = await db.wish.findMany({ where: { participant: { gameId, userId: user.id } }, select: { imageUrl: true } });
  await db.participant.deleteMany({ where: { gameId, userId: user.id } });
  await deleteUnusedUploads(photos.map((w) => w.imageUrl));
}

export async function setParticipantGroup(actor: User, gameId: string, participantId: string, group: AgeGroup) {
  const game = await getManagedGame(actor, gameId);
  assertOpen(game);
  const p = await db.participant.findUnique({ where: { id: participantId } });
  if (!p || p.gameId !== game.id) throw new AppError("Ese participante no está en la sala.");
  await db.participant.update({ where: { id: p.id }, data: { group: group === "CHILD" ? "CHILD" : "ADULT" } });
}

/** Lista para el panel del admin, con códigos visibles (salvo de otros admins). */
export async function listParticipantsForAdmin(actor: User, gameId: string) {
  const game = await getManagedGame(actor, gameId);
  const rows = await db.participant.findMany({
    where: { gameId: game.id },
    include: { user: true, _count: { select: { wishes: true, givingAs: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    userId: p.userId,
    name: p.user.name,
    avatar: p.user.avatar,
    group: p.group,
    wishCount: p._count.wishes,
    wantsSurprise: p.wantsSurprise,
    emptyList: !p.wantsSurprise && p._count.wishes === 0,
    revealed: Boolean(p.revealedAt),
    hasPin: Boolean(p.user.pinHash),
    // El código de invitación solo se muestra mientras no haya creado su PIN
    code: p.user.pinHash || (p.user.role === "ADMIN" && p.user.id !== actor.id) ? null : revealLoginCode(p.user),
  }));
}

/** Personas de otras salas que se pueden reutilizar. */
export async function listReusableUsers(actor: User, gameId: string) {
  const game = await getManagedGame(actor, gameId);
  return db.user.findMany({
    where: { participants: { none: { gameId: game.id } } },
    select: { id: true, name: true, avatar: true },
    orderBy: { name: "asc" },
    take: 300,
  });
}

// ── Exclusiones ─────────────────────────────────────────────

export async function addExclusion(actor: User, gameId: string, aId: string, bId: string) {
  const game = await getManagedGame(actor, gameId);
  assertOpen(game);
  if (aId === bId) throw new AppError("Elige dos personas distintas.");
  const ps = await db.participant.findMany({ where: { id: { in: [aId, bId] }, gameId: game.id } });
  if (ps.length !== 2) throw new AppError("Las dos personas tienen que estar en la sala.");
  const [x, y] = [aId, bId].sort();
  const exists = await db.exclusion.findUnique({ where: { gameId_aId_bId: { gameId: game.id, aId: x, bId: y } } });
  if (exists) throw new AppError("Esa exclusión ya existe.");
  return db.exclusion.create({ data: { gameId: game.id, aId: x, bId: y } });
}

export async function removeExclusion(actor: User, gameId: string, exclusionId: string) {
  const game = await getManagedGame(actor, gameId);
  assertOpen(game);
  await db.exclusion.deleteMany({ where: { id: exclusionId, gameId: game.id } });
}

export async function listExclusions(gameId: string) {
  return db.exclusion.findMany({
    where: { gameId },
    include: { a: { include: { user: true } }, b: { include: { user: true } } },
  });
}
