"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AgeGroup, GroupMode, SignupMode } from "@prisma/client";
import { runAction, type ActionResult } from "@/lib/errors";
import { parseEuros } from "@/lib/money";
import { parseLocalDateTime } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import {
  createGame, createNextEdition, deleteGame, finishGame, rotateJoinToken, setJoinOpen, updateGame,
  type GameInput,
} from "@/lib/services/games";
import {
  addExclusion, addParticipantByAdmin, joinGame, leaveGame, registerAndJoin, removeExclusion,
  removeParticipant, setParticipantGroup,
} from "@/lib/services/participants";
import { checkDraw, performDraw, resetDraw, type DrawCheck } from "@/lib/services/drawing";
import { startSession } from "@/lib/session";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function parseGameForm(fd: FormData): GameInput {
  return {
    name: s(fd, "name"),
    description: s(fd, "description"),
    cover: s(fd, "cover"),
    eventDate: parseLocalDateTime(s(fd, "eventDate")),
    location: s(fd, "location"),
    signupMode: (s(fd, "signupMode") || "BOTH") as SignupMode,
    groupMode: (s(fd, "groupMode") || "NONE") as GroupMode,
    budgetMin: fd.get("useBudget") ? parseEuros(s(fd, "budgetMin")) : null,
    budgetMax: fd.get("useBudget") ? parseEuros(s(fd, "budgetMax")) : null,
    anonChat: fd.get("anonChat") === "on",
    avoidPrevious: fd.get("avoidPrevious") === "on",
    wishlistDeadline: parseLocalDateTime(s(fd, "wishlistDeadline")),
  };
}

function touch(gameId: string) {
  revalidatePath(`/sala/${gameId}`, "layout");
  revalidatePath("/");
}

export async function createGameAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() =>
    createGame(user, {
      ...parseGameForm(fd),
      joinAsParticipant: fd.get("joinAsParticipant") === "on",
      ownerGroup: s(fd, "ownerGroup") === "CHILD" ? "CHILD" : "ADULT",
    }),
  );
  if (!r.ok) return r;
  redirect(`/sala/${r.data!.id}/admin?nueva=1`);
}

export async function updateGameAction(gameId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => updateGame(user, gameId, parseGameForm(fd)), "Configuración guardada");
  touch(gameId);
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function setJoinOpenAction(gameId: string, open: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => setJoinOpen(user, gameId, open));
  touch(gameId);
  return r.ok ? { ok: true } : r;
}

export async function rotateJoinTokenAction(gameId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => rotateJoinToken(user, gameId), "Enlace nuevo creado: el anterior ya no funciona.");
  touch(gameId);
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function finishGameAction(gameId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => finishGame(user, gameId), "Sala cerrada. ¡Felices fiestas!");
  touch(gameId);
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function deleteGameAction(gameId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => deleteGame(user, gameId, s(fd, "confirm")));
  if (!r.ok) return r;
  revalidatePath("/");
  redirect("/");
}

export async function nextEditionAction(gameId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => createNextEdition(user, gameId, s(fd, "name")));
  if (!r.ok) return r;
  redirect(`/sala/${r.data!.id}/admin?nueva=1`);
}

export async function checkDrawAction(gameId: string): Promise<DrawCheck> {
  const user = await requireUser();
  const r = await runAction(() => checkDraw(user, gameId));
  return r.ok ? r.data! : { ok: false, error: r.error };
}

export async function drawAction(gameId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => performDraw(user, gameId));
  touch(gameId);
  if (!r.ok) return r;
  return { ok: true, message: ["¡Sorteo hecho! 🎉 Cada persona ya puede ver a quién regala.", ...r.data!.warnings].join(" ") };
}

export async function resetDrawAction(gameId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => resetDraw(user, gameId), "Sorteo deshecho. Puedes cambiar lo que necesites y volver a sortear.");
  touch(gameId);
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function addParticipantAction(gameId: string, _: unknown, fd: FormData): Promise<ActionResult<{ code?: string; name: string }>> {
  const user = await requireUser();
  const existingUserId = s(fd, "existingUserId") || undefined;
  const r = await runAction(() =>
    addParticipantByAdmin(user, gameId, {
      name: s(fd, "name"),
      group: (s(fd, "group") || "ADULT") as AgeGroup,
      existingUserId,
    }),
  );
  touch(gameId);
  if (!r.ok) return r;
  const name = s(fd, "name") || "Participante";
  return {
    ok: true,
    data: { code: r.data!.code, name },
    message: r.data!.code ? `${name} añadido. Su código es ${r.data!.code}` : "Añadido a la sala.",
  };
}

export async function removeParticipantAction(gameId: string, participantId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => removeParticipant(user, gameId, participantId));
  touch(gameId);
  return r.ok ? { ok: true } : r;
}

export async function setGroupAction(gameId: string, participantId: string, group: AgeGroup): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => setParticipantGroup(user, gameId, participantId, group));
  touch(gameId);
  return r.ok ? { ok: true } : r;
}

export async function addExclusionAction(gameId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => addExclusion(user, gameId, s(fd, "a"), s(fd, "b")), "Exclusión añadida");
  touch(gameId);
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function removeExclusionAction(gameId: string, exclusionId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => removeExclusion(user, gameId, exclusionId));
  touch(gameId);
  return r.ok ? { ok: true } : r;
}

export async function joinAction(token: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser(`/unirse/${token}`);
  const r = await runAction(() => joinGame(user, token, (s(fd, "group") || "ADULT") as AgeGroup));
  if (!r.ok) return r;
  redirect(`/sala/${r.data!.game.id}`);
}

export async function registerJoinAction(token: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(() =>
    registerAndJoin(token, {
      name: s(fd, "name"),
      pin: s(fd, "pin"),
      repeat: s(fd, "pin2"),
      group: (s(fd, "group") || "ADULT") as AgeGroup,
    }),
  );
  if (!r.ok) return r;
  await startSession(r.data!.user.id);
  redirect(`/sala/${r.data!.game.id}?bienvenida=1`);
}

export async function leaveGameAction(gameId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => leaveGame(user, gameId));
  if (!r.ok) return r;
  revalidatePath("/");
  redirect("/");
}
