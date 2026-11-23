/**
 * Gestión de cuentas por quien organiza salas.
 *
 * Cada organizador lleva solo a "su gente": las personas apuntadas en las salas
 * que ha creado. Un admin, además, reparte permisos y puede ver todas las cuentas.
 *
 * Una persona que también está en salas de OTRO organizador es compartida: solo
 * un admin puede resetear su acceso o eliminarla (un reseteo da un código con el
 * que se entra en su cuenta, y con ello en las salas del otro).
 */
import type { Role, User } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { deleteUnusedUploads } from "../uploads";
import { regenerateLoginCode, revealLoginCode } from "./auth";

export interface PersonRow {
  id: string;
  name: string;
  avatar: string;
  role: Role;
  /** En cuántas de MIS salas está */
  myGames: number;
  hasPin: boolean;
  /** Código de invitación pendiente (solo si puedo gestionar a la persona y aún no tiene PIN) */
  code: string | null;
  /** Puedo resetear su acceso o eliminarla */
  canManage: boolean;
}

async function gamesWith(actorId: string, userId: string): Promise<{ mine: number; others: number }> {
  const [mine, total] = await Promise.all([
    db.participant.count({ where: { userId, game: { ownerId: actorId } } }),
    db.participant.count({ where: { userId } }),
  ]);
  return { mine, others: total - mine };
}

/** Comprueba que `actor` puede resetear o eliminar a esa persona y la devuelve. */
async function manageablePerson(actor: User, userId: string, selfError: string): Promise<User> {
  if (actor.role === "USER") throw new AppError("Solo un administrador u organizador puede hacer esto.");
  if (actor.id === userId) throw new AppError(selfError);
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new AppError("Esa persona no existe.");
  if (actor.role !== "ADMIN") {
    const { mine, others } = await gamesWith(actor.id, userId);
    // Mismo mensaje que si no existiera: no confirmar cuentas ajenas
    if (mine === 0) throw new AppError("Esa persona no existe.");
    if (target.role !== "USER") throw new AppError("Esa persona organiza salas: solo un administrador puede gestionar su cuenta.");
    if (others > 0) {
      throw new AppError(`${target.name} también está en salas de otro organizador: pídeselo a un administrador.`);
    }
  } else if (target.role !== "USER") {
    throw new AppError("Quítale antes el rol de admin u organizador.");
  }
  return target;
}

/**
 * Personas que ve quien organiza: las de sus salas. Un admin ve además a quienes
 * tienen permisos (organizadores y admins) y, con `all`, todas las cuentas.
 */
export async function listPeople(actor: User, opts: { all?: boolean } = {}): Promise<{ people: PersonRow[]; hiddenCount: number }> {
  if (actor.role === "USER") throw new AppError("Solo un administrador u organizador puede hacer esto.");
  const admin = actor.role === "ADMIN";
  const inMyGames = { participants: { some: { game: { ownerId: actor.id } } } };
  const visible = admin
    ? opts.all
      ? {}
      : { OR: [inMyGames, { role: { not: "USER" as Role } }, { id: actor.id }] }
    : { OR: [inMyGames, { id: actor.id }] };
  const users = await db.user.findMany({
    where: visible,
    orderBy: [{ role: "desc" }, { name: "asc" }],
    include: { participants: { select: { game: { select: { ownerId: true } } } } },
  });
  const people = users.map((u) => {
    const myGames = u.participants.filter((p) => p.game.ownerId === actor.id).length;
    const shared = u.participants.length > myGames;
    const canManage = u.id !== actor.id && u.role === "USER" && (admin || (myGames > 0 && !shared));
    return {
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      role: u.role,
      myGames,
      hasPin: Boolean(u.pinHash),
      code: !u.pinHash && (canManage || u.id === actor.id) ? revealLoginCode(u) : null,
      canManage,
    };
  });
  const hiddenCount = admin && !opts.all ? (await db.user.count()) - people.length : 0;
  return { people, hiddenCount };
}

/** Resetear acceso: borra el PIN, cierra sesiones y da un código de invitación nuevo. */
export async function resetUserAccess(actor: User, userId: string): Promise<string> {
  const target = await manageablePerson(actor, userId, "Tu propio PIN lo cambias desde tu perfil.");
  return regenerateLoginCode(target.id);
}

/**
 * Elimina a una persona y todo lo suyo: participaciones, listas, fotos subidas,
 * enlaces, sesiones, avisos push, chats en los que participó y exclusiones.
 * Las salas que hubiera creado pasan a quien la elimina.
 *
 * No se puede si está en una sala ya sorteada y sin cerrar: rompería el sorteo
 * de otra persona. Primero hay que deshacer el sorteo o cerrar la sala.
 */
export async function deleteUserByAdmin(actor: User, userId: string): Promise<{ removedFiles: number }> {
  await manageablePerson(actor, userId, "No puedes eliminar tu propia cuenta.");
  const target = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { participants: { include: { game: { select: { name: true, status: true } } } } },
  });
  const blocking = target.participants.filter((p) => p.game.status === "DRAWN");
  if (blocking.length) {
    throw new AppError(
      `Está en una sala ya sorteada (${blocking.map((p) => `«${p.game.name}»`).join(", ")}). Deshaz el sorteo o cierra la sala antes de eliminarla.`,
    );
  }
  const photos = await db.wish.findMany({
    where: { participant: { userId }, imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  await db.$transaction([
    db.game.updateMany({ where: { ownerId: userId }, data: { ownerId: actor.id } }),
    // Participaciones (listas, ideas, enlaces, asignaciones, chats, exclusiones),
    // sesiones y avisos push caen en cascada con el usuario.
    db.user.delete({ where: { id: userId } }),
  ]);
  const removedFiles = await deleteUnusedUploads(photos.map((p) => p.imageUrl));
  return { removedFiles };
}
