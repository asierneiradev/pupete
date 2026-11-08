/** Salas (juegos): creación, configuración, permisos y nueva edición. */
import type { Game, GroupMode, SignupMode, User } from "@prisma/client";
import { db } from "../db";
import { randomToken } from "../crypto";
import { AppError } from "../errors";
import { deleteUnusedUploads } from "../uploads";

export const COVERS = ["bosque", "nieve", "faroles", "colinas"] as const;
export type Cover = (typeof COVERS)[number];

export interface GameInput {
  name: string;
  description?: string | null;
  cover?: string;
  eventDate?: Date | null;
  location?: string | null;
  signupMode: SignupMode;
  groupMode: GroupMode;
  budgetMin?: number | null;
  budgetMax?: number | null;
  anonChat: boolean;
  avoidPrevious: boolean;
  wishlistDeadline?: Date | null;
}

function validate(input: GameInput) {
  const name = input.name?.trim();
  if (!name) throw new AppError("La sala necesita un nombre.");
  if (name.length > 80) throw new AppError("El nombre es demasiado largo (máx. 80).");
  if (input.budgetMin != null && input.budgetMax != null && input.budgetMin > input.budgetMax) {
    throw new AppError("El precio mínimo no puede ser mayor que el máximo.");
  }
  if ((input.budgetMax ?? 0) > 100_000_00) throw new AppError("Ese presupuesto es demasiado alto.");
  if (!["INVITE", "ADMIN_CREATED", "BOTH"].includes(input.signupMode)) throw new AppError("Modo de alta no válido.");
  if (!["NONE", "SEPARATE", "KIDS_FROM_ADULTS"].includes(input.groupMode)) throw new AppError("Modo de grupos no válido.");
  return {
    name,
    description: input.description?.trim().slice(0, 500) || null,
    cover: COVERS.includes(input.cover as Cover) ? input.cover! : "bosque",
    eventDate: input.eventDate ?? null,
    location: input.location?.trim().slice(0, 120) || null,
    signupMode: input.signupMode,
    groupMode: input.groupMode,
    budgetMin: input.budgetMin ?? null,
    budgetMax: input.budgetMax ?? null,
    anonChat: input.anonChat,
    avoidPrevious: input.avoidPrevious,
    wishlistDeadline: input.wishlistDeadline ?? null,
  };
}

export function canManage(user: Pick<User, "id" | "role">, game: Pick<Game, "ownerId">): boolean {
  return user.role === "ADMIN" || game.ownerId === user.id;
}

export async function getManagedGame(user: User, gameId: string): Promise<Game> {
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError("La sala no existe.");
  if (!canManage(user, game)) throw new AppError("No tienes permiso para gestionar esta sala.");
  return game;
}

export async function createGame(
  owner: User,
  input: GameInput & { joinAsParticipant?: boolean; ownerGroup?: "ADULT" | "CHILD" },
): Promise<Game> {
  if (owner.role !== "ADMIN") throw new AppError("Solo un administrador puede crear salas.");
  const data = validate(input);
  return db.game.create({
    data: {
      ...data,
      ownerId: owner.id,
      joinToken: randomToken(18),
      participants: input.joinAsParticipant
        ? { create: { userId: owner.id, group: input.ownerGroup ?? "ADULT" } }
        : undefined,
    },
  });
}

export async function updateGame(user: User, gameId: string, input: GameInput): Promise<Game> {
  const game = await getManagedGame(user, gameId);
  const data = validate(input);
  if (game.status !== "OPEN" && data.groupMode !== game.groupMode) {
    throw new AppError("No se pueden cambiar los grupos después del sorteo. Deshaz el sorteo primero.");
  }
  return db.game.update({ where: { id: game.id }, data });
}

export async function setJoinOpen(user: User, gameId: string, open: boolean): Promise<void> {
  const game = await getManagedGame(user, gameId);
  await db.game.update({ where: { id: game.id }, data: { joinOpen: open } });
}

export async function rotateJoinToken(user: User, gameId: string): Promise<string> {
  const game = await getManagedGame(user, gameId);
  const joinToken = randomToken(18);
  await db.game.update({ where: { id: game.id }, data: { joinToken } });
  return joinToken;
}

export async function finishGame(user: User, gameId: string): Promise<void> {
  const game = await getManagedGame(user, gameId);
  if (game.status !== "DRAWN") throw new AppError("Solo se puede cerrar una sala ya sorteada.");
  await db.game.update({ where: { id: game.id }, data: { status: "FINISHED", joinOpen: false } });
}

export async function deleteGame(user: User, gameId: string, confirmName: string): Promise<void> {
  const game = await getManagedGame(user, gameId);
  if (confirmName.trim() !== game.name) throw new AppError("Escribe el nombre exacto de la sala para confirmar.");
  const photos = await db.wish.findMany({ where: { participant: { gameId: game.id } }, select: { imageUrl: true } });
  await db.game.delete({ where: { id: game.id } });
  await deleteUnusedUploads(photos.map((w) => w.imageUrl));
}

/**
 * Crea la edición del año siguiente: misma configuración, mismas personas y
 * grupos, mismas exclusiones, y enlazada para no repetir asignaciones.
 */
export async function createNextEdition(user: User, gameId: string, name: string): Promise<Game> {
  const prev = await getManagedGame(user, gameId);
  const full = await db.game.findUniqueOrThrow({
    where: { id: prev.id },
    include: { participants: true, exclusions: true },
  });
  const cleanNameStr = name.trim() || `${prev.name} (nueva edición)`;
  return db.$transaction(async (tx) => {
    const next = await tx.game.create({
      data: {
        name: cleanNameStr.slice(0, 80),
        description: full.description,
        cover: full.cover,
        location: full.location,
        signupMode: full.signupMode,
        groupMode: full.groupMode,
        budgetMin: full.budgetMin,
        budgetMax: full.budgetMax,
        currency: full.currency,
        anonChat: full.anonChat,
        avoidPrevious: true,
        previousGameId: full.id,
        ownerId: user.id,
        joinToken: randomToken(18),
      },
    });
    const idMap = new Map<string, string>();
    for (const p of full.participants) {
      const created = await tx.participant.create({ data: { gameId: next.id, userId: p.userId, group: p.group } });
      idMap.set(p.id, created.id);
    }
    for (const e of full.exclusions) {
      const a = idMap.get(e.aId);
      const b = idMap.get(e.bId);
      if (a && b) await tx.exclusion.create({ data: { gameId: next.id, aId: a, bId: b } });
    }
    return next;
  });
}

/** Salas en las que participo o que gestiono. */
export async function listGamesForUser(user: User) {
  const participating = await db.game.findMany({
    where: { participants: { some: { userId: user.id } } },
    include: { _count: { select: { participants: true } } },
    orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
  });
  const managed =
    user.role === "ADMIN"
      ? await db.game.findMany({
          include: { _count: { select: { participants: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [];
  return { participating, managed };
}
