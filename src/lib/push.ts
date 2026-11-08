/**
 * Avisos Web Push (VAPID). Si no hay claves configuradas, todo es no-op y la
 * interfaz no ofrece activar avisos.
 */
import webpush from "web-push";
import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Devuelve el código HTTP del servicio push (201 = ok; 404/410 = suscripción caducada). */
export type PushSender = (target: PushTarget, payload: string) => Promise<number>;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

const realSender: PushSender = async (t, payload) => {
  try {
    const r = await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
      vapidDetails: {
        subject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
        publicKey: process.env.VAPID_PUBLIC_KEY!,
        privateKey: process.env.VAPID_PRIVATE_KEY!,
      },
      TTL: 60 * 60 * 24 * 3,
      urgency: "high",
      timeout: 8000,
    });
    return r.statusCode;
  } catch (e) {
    if (e instanceof webpush.WebPushError) return e.statusCode;
    throw e;
  }
};

let sender: PushSender = realSender;

/** Solo para tests: sustituye el envío real. */
export function setPushSender(s: PushSender | null) {
  sender = s ?? realSender;
}

const MAX_SUBS_PER_USER = 10;

export async function saveSubscription(user: User, raw: unknown, userAgent?: string | null) {
  const sub = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    throw new AppError("Suscripción de avisos no válida.");
  }
  const saved = await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh, auth, userAgent: userAgent?.slice(0, 200) ?? null },
    // Si el mismo navegador cambia de usuario, la suscripción pasa al nuevo
    update: { userId: user.id, p256dh, auth, userAgent: userAgent?.slice(0, 200) ?? null },
  });
  // Tope por usuario: se quedan las más recientes
  const old = await db.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    skip: MAX_SUBS_PER_USER,
    select: { id: true },
  });
  if (old.length) await db.pushSubscription.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return saved;
}

export async function removeSubscription(user: User, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
}

/** Envía a todos los dispositivos de un usuario. Nunca lanza: un aviso fallido no rompe nada. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
  if (!vapidPublicKey() && sender === realSender) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        const status = await sender(s, body);
        if (status === 404 || status === 410) {
          await db.pushSubscription.deleteMany({ where: { id: s.id } });
        } else if (status >= 200 && status < 300) {
          sent++;
        }
      } catch (e) {
        console.error("[push] fallo enviando aviso:", (e as Error).message);
      }
    }),
  );
  return sent;
}
