"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { removeSubscription, saveSubscription } from "@/lib/push";
import { AppError, runAction, type ActionResult } from "@/lib/errors";
import { parseEuros } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { saveUpload } from "@/lib/uploads";
import { markRevealed } from "@/lib/services/drawing";
import { notifyNewChatMessage, sendChatMessage } from "@/lib/services/chat";
import {
  addWish, copyWishesFrom, deleteWish, setSurprisePurchased, setWantsSurprise, setWishPurchased, updateWish, type WishInput,
} from "@/lib/services/wishes";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function parseWish(fd: FormData): Promise<WishInput> {
  let imageUrl: string | null = s(fd, "currentImage") || null;
  if (fd.get("removeImage") === "on") imageUrl = null;
  const file = fd.get("image");
  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
    imageUrl = await saveUpload(Buffer.from(await file.arrayBuffer()));
  }
  const priceRaw = s(fd, "price");
  const priceCents = parseEuros(priceRaw);
  if (priceRaw.trim() && priceCents == null) throw new AppError("El precio no es válido (ej.: 19,99).");
  return {
    title: s(fd, "title"),
    details: s(fd, "details"),
    priority: Number(s(fd, "priority") || 2),
    priceCents,
    imageUrl,
    links: fd.getAll("links").map(String),
  };
}

export async function saveWishAction(gameId: string, wishId: string | null, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(async () => {
    const input = await parseWish(fd);
    return wishId ? updateWish(user, wishId, input) : addWish(user, gameId, input);
  }, wishId ? "Idea actualizada" : "¡Idea añadida a tu lista! 🎁");
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function deleteWishAction(gameId: string, wishId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => deleteWish(user, wishId));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}

export async function copyWishesAction(gameId: string, fromGameId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => copyWishesFrom(user, gameId, fromGameId));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true, message: `${r.data} idea(s) copiada(s).` } : r;
}

export async function togglePurchasedAction(gameId: string, wishId: string, purchased: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => setWishPurchased(user, wishId, purchased));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}

export async function toggleSurpriseAction(gameId: string, receiverId: string, purchased: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => setSurprisePurchased(user, receiverId, purchased));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}

export async function revealAction(gameId: string): Promise<void> {
  const user = await requireUser();
  await markRevealed(user, gameId);
  revalidatePath(`/sala/${gameId}`);
}

export async function sendMessageAction(gameId: string, assignmentId: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => sendChatMessage(user, assignmentId, s(fd, "body")));
  revalidatePath(`/sala/${gameId}/chat/${assignmentId}`);
  // El aviso push sale después de responder, sin hacer esperar a quien escribe
  const messageId = r.ok ? r.data?.id : undefined;
  if (messageId) {
    after(() => notifyNewChatMessage(messageId).catch((e) => console.error("[push]", e)));
  }
  return r.ok ? { ok: true } : r;
}

export async function savePushSubscriptionAction(subscription: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const ua = (await headers()).get("user-agent");
  return runAction(async () => {
    await saveSubscription(user, subscription, ua);
    return undefined;
  }, "Avisos activados en este dispositivo.");
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await removeSubscription(user, String(endpoint ?? ""));
    return undefined;
  }, "Avisos desactivados en este dispositivo.");
}

export async function setWantsSurpriseAction(gameId: string, value: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => setWantsSurprise(user, gameId, value));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}
