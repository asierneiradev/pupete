/** Sorteo: comprobación, ejecución, deshacer, revelación y progreso. */
import type { User } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { DrawError, runDraw, validateDraw, type DrawInput, type DrawResult } from "../draw";
import { notifyUser } from "../push";
import { getManagedGame } from "./games";

async function buildInput(gameId: string): Promise<DrawInput> {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { participants: { include: { user: true } }, exclusions: true },
  });
  let previousPairs: Array<[string, string]> = [];
  if (game.avoidPrevious && game.previousGameId) {
    const prev = await db.assignment.findMany({
      where: { gameId: game.previousGameId },
      include: { giver: true, receiver: true },
    });
    previousPairs = prev.map((a) => [a.giver.userId, a.receiver.userId]);
  }
  return {
    participants: game.participants.map((p) => ({ id: p.id, userId: p.userId, name: p.user.name, group: p.group })),
    mode: game.groupMode,
    exclusions: game.exclusions.map((e) => [e.aId, e.bId]),
    previousPairs,
  };
}

export type DrawCheck = { ok: true; warnings: string[] } | { ok: false; error: string };

/** Simula el sorteo sin guardar nada para avisar de problemas. */
export async function checkDraw(actor: User, gameId: string): Promise<DrawCheck> {
  const game = await getManagedGame(actor, gameId);
  try {
    const r = runDraw(await buildInput(game.id));
    const empty = await db.participant.findMany({
      where: { gameId: game.id, wantsSurprise: false, wishes: { none: {} } },
      include: { user: { select: { name: true } } },
    });
    const warnings = [...r.warnings];
    if (empty.length) {
      warnings.push(`Con la lista vacía (ni ideas ni «sorpréndeme»): ${empty.map((p) => p.user.name).join(", ")}.`);
    }
    return { ok: true, warnings };
  } catch (e) {
    if (e instanceof DrawError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function performDraw(actor: User, gameId: string): Promise<DrawResult> {
  const game = await getManagedGame(actor, gameId);
  if (game.status !== "OPEN") throw new AppError("El sorteo ya está hecho.");
  const input = await buildInput(game.id);
  let result: DrawResult;
  try {
    result = runDraw(input);
  } catch (e) {
    if (e instanceof DrawError) throw new AppError(e.message);
    throw e;
  }
  const problems = validateDraw(input, result.pairs);
  if (problems.length) throw new Error(`Sorteo inválido: ${problems.join("; ")}`);

  await db.$transaction(async (tx) => {
    // Bloqueo optimista: solo un sorteo gana si se pulsa dos veces
    const updated = await tx.game.updateMany({
      where: { id: game.id, status: "OPEN" },
      data: { status: "DRAWN", drawnAt: new Date(), joinOpen: false },
    });
    if (updated.count !== 1) throw new AppError("El sorteo ya está hecho.");
    await tx.assignment.createMany({ data: result.pairs.map((p) => ({ gameId: game.id, ...p })) });
  });

  // Aviso push a quien lo tenga activado. No revela nada.
  const people = await db.participant.findMany({ where: { gameId: game.id }, select: { userId: true } });
  await Promise.allSettled(
    people.map((p) =>
      notifyUser(p.userId, {
        title: `🎁 ¡Ya hay sorteo en «${game.name}»!`,
        body: "Entra para descubrir a quién te ha tocado.",
        url: `/sala/${game.id}`,
        tag: `draw-${game.id}`,
      }),
    ),
  );
  return result;
}

export async function resetDraw(actor: User, gameId: string): Promise<void> {
  const game = await getManagedGame(actor, gameId);
  if (game.status !== "DRAWN") throw new AppError("Solo se puede deshacer un sorteo hecho (y no cerrado).");
  await db.$transaction([
    db.assignment.deleteMany({ where: { gameId: game.id } }),
    db.participant.updateMany({ where: { gameId: game.id }, data: { revealedAt: null, surprisePurchased: false } }),
    db.wish.updateMany({ where: { participant: { gameId: game.id } }, data: { purchased: false } }),
    db.game.update({ where: { id: game.id }, data: { status: "OPEN", drawnAt: null } }),
  ]);
}

/** A quién regalo (puede ser más de una persona en el modo niños). */
export async function getMyReceivers(user: User, gameId: string) {
  const me = await db.participant.findUnique({ where: { gameId_userId: { gameId, userId: user.id } } });
  if (!me) throw new AppError("No participas en esta sala.");
  const assignments = await db.assignment.findMany({
    where: { gameId, giverId: me.id },
    include: {
      receiver: {
        include: {
          user: true,
          wishes: { include: { links: true }, orderBy: [{ priority: "asc" }, { position: "asc" }] },
        },
      },
    },
  });
  return {
    me,
    receivers: assignments.map((a) => {
      const u = a.receiver.user;
      return {
        assignmentId: a.id,
        participantId: a.receiver.id,
        group: a.receiver.group,
        surprisePurchased: a.receiver.surprisePurchased,
        wantsSurprise: a.receiver.wantsSurprise,
        name: u.name,
        avatar: u.avatar,
        profile: {
          shirtSize: u.shirtSize,
          pantsSize: u.pantsSize,
          shoeSize: u.shoeSize,
          favoriteColors: u.favoriteColors,
          likes: u.likes,
          dislikes: u.dislikes,
          allergies: u.allergies,
        },
        wishes: a.receiver.wishes,
      };
    }),
  };
}

export async function markRevealed(user: User, gameId: string): Promise<void> {
  await db.participant.updateMany({ where: { gameId, userId: user.id, revealedAt: null }, data: { revealedAt: new Date() } });
}

/** Progreso para el admin, sin revelar asignaciones. */
export async function gameProgress(gameId: string) {
  const ps = await db.participant.findMany({
    where: { gameId },
    select: { revealedAt: true, group: true, _count: { select: { wishes: true } } },
  });
  return {
    total: ps.length,
    adults: ps.filter((p) => p.group === "ADULT").length,
    kids: ps.filter((p) => p.group === "CHILD").length,
    withWishes: ps.filter((p) => p._count.wishes > 0).length,
    revealed: ps.filter((p) => p.revealedAt).length,
  };
}
