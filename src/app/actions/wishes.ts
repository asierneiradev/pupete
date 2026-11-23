"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { removeSubscription, saveSubscription, sendTestPush } from "@/lib/push";
import { AppError, runAction, type ActionResult } from "@/lib/errors";
import { parseEuros } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { saveUpload } from "@/lib/uploads";
import { markRevealed } from "@/lib/services/drawing";
import { notifyNewChatMessage, sendChatMessage } from "@/lib/services/chat";
import {
  addWish, copyWishesFrom, deleteWish, publishMyList, setSurprisePurchased, setWantsSurprise, setWishPurchased, updateWish, type WishInput,
} from "@/lib/services/wishes";

import { addSecretWish, claimWish, deleteSecretWish, setClaimAmount, setClaimPurchased, unclaimWish, updateSecretWish } from "@/lib/services/giftlist";
import { notifyJointJoined, notifyListPublished, notifySecretIdea, notifyWishAdded } from "@/lib/services/giftnotify";

/** Los avisos push salen después de responder, sin hacer esperar a quien pulsa. */
function pushLater(fn: () => Promise<unknown>) {
  after(() => fn().catch((e) => console.error("[push]", e)));
}

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
  const addedId = r.ok && !wishId ? r.data?.id : undefined;
  if (addedId) pushLater(() => notifyWishAdded(addedId));
  return r.ok ? { ok: true, message: r.message } : r;
}

/** Lista de regalos: mi lista deja de ser un borrador y la ve el resto de la sala. */
export async function publishListAction(gameId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => publishMyList(user, gameId), "¡Lista publicada! 🎉 Los demás ya la ven.");
  revalidatePath(`/sala/${gameId}`);
  const published = r.ok && r.data?.published ? r.data.participantId : undefined;
  if (published) pushLater(() => notifyListPublished(published));
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

// ── Lista de regalos ────────────────────────────────────────

/** Idea propuesta para la lista de otra persona (ella no la ve). */
export async function saveSecretWishAction(gameId: string, honoreeId: string, wishId: string | null, _: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(async () => {
    const input = await parseWish(fd);
    return wishId ? updateSecretWish(user, wishId, input) : addSecretWish(user, gameId, honoreeId, input);
  }, wishId ? "Idea actualizada" : "¡Idea propuesta! 🤫 Solo la veis los que regaláis.");
  revalidatePath(`/sala/${gameId}`);
  const proposedId = r.ok && !wishId ? r.data?.id : undefined;
  if (proposedId) pushLater(() => notifySecretIdea(proposedId));
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function deleteSecretWishAction(gameId: string, wishId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => deleteSecretWish(user, wishId));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}

export async function claimWishAction(gameId: string, wishId: string, joint: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => claimWish(user, wishId, joint));
  revalidatePath(`/sala/${gameId}`);
  if (r.ok && r.data?.joined) pushLater(() => notifyJointJoined(wishId, user.id));
  return r.ok ? { ok: true } : r;
}

/** Bote común: lo que pongo yo en un regalo entre varios ("" = sin decidir). */
export async function setClaimAmountAction(gameId: string, wishId: string, amount: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(async () => {
    const raw = String(amount ?? "").trim();
    const cents = parseEuros(raw);
    if (raw && cents == null) throw new AppError("Esa cantidad no es válida (ej.: 20 o 12,50).");
    await setClaimAmount(user, wishId, cents);
    return undefined;
  });
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}

export async function testPushAction(): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => sendTestPush(user));
  if (!r.ok) return r;
  const { devices, sent } = r.data!;
  if (sent === 0) {
    return { ok: false, error: "El aviso no ha podido salir. Desactiva los avisos, vuelve a activarlos y prueba otra vez." };
  }
  return {
    ok: true,
    message:
      sent < devices
        ? `Aviso enviado a ${sent} de tus ${devices} dispositivos. Debería sonar en unos segundos.`
        : "Aviso enviado. Debería sonar en unos segundos; si no llega, mira los consejos de abajo.",
  };
}

export async function unclaimWishAction(gameId: string, wishId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => unclaimWish(user, wishId));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}

export async function claimPurchasedAction(gameId: string, wishId: string, purchased: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(() => setClaimPurchased(user, wishId, purchased));
  revalidatePath(`/sala/${gameId}`);
  return r.ok ? { ok: true } : r;
}
