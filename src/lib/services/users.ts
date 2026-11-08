/** Gestión de cuentas por un admin: eliminar personas con todos sus datos. */
import type { User } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { deleteUnusedUploads } from "../uploads";

/**
 * Elimina a una persona y todo lo suyo: participaciones, listas, fotos subidas,
 * enlaces, sesiones, avisos push, chats en los que participó y exclusiones.
 * Las salas que hubiera creado pasan a quien la elimina.
 *
 * No se puede si está en una sala ya sorteada y sin cerrar: rompería el sorteo
 * de otra persona. Primero hay que deshacer el sorteo o cerrar la sala.
 */
export async function deleteUserByAdmin(actor: User, userId: string): Promise<{ removedFiles: number }> {
  if (actor.role !== "ADMIN") throw new AppError("Solo un administrador puede hacer esto.");
  if (actor.id === userId) throw new AppError("No puedes eliminar tu propia cuenta.");
  const target = await db.user.findUnique({
    where: { id: userId },
    include: { participants: { include: { game: { select: { name: true, status: true } } } } },
  });
  if (!target) throw new AppError("Esa persona no existe.");
  if (target.role === "ADMIN") throw new AppError("Quítale antes el rol de admin.");
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
    // sesiones, enlaces mágicos y avisos push caen en cascada con el usuario.
    db.user.delete({ where: { id: userId } }),
  ]);
  const removedFiles = await deleteUnusedUploads(photos.map((p) => p.imageUrl));
  return { removedFiles };
}
