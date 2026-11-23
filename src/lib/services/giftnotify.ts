/**
 * Avisos push de las listas de regalos.
 *
 * Misma regla de oro que en `giftlist.ts`: a quien recibe NUNCA le llega nada
 * sobre su propia lista (ni ideas secretas, ni quién se apunta, ni qué falta).
 * Ninguna función lanza: un aviso fallido no rompe nada.
 */
import { db } from "../db";
import { appTimeZone } from "../dates";
import { notifyUsers } from "../push";
import { thanksVisible } from "./giftlist";

const first = (n: string) => n.split(" ")[0];
const short = (t: string, max = 60) => (t.length > max ? t.slice(0, max - 1) + "…" : t);

/** Usuarios apuntados en la sala, menos los indicados. */
async function participantUserIds(gameId: string, except: string[]): Promise<string[]> {
  const rows = await db.participant.findMany({ where: { gameId, userId: { notIn: except } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

// Quien rellena su lista añade varias cosas seguidas: un aviso por persona cada media hora
const LIST_THROTTLE_MS = 30 * 60_000;
const lastListNotice = new Map<string, number>();

/** Solo para tests. */
export function resetGiftNotifyThrottle() {
  lastListNotice.clear();
}

/** Quien recibe ha añadido algo a su lista → aviso a los demás de la sala. */
export async function notifyWishAdded(wishId: string, now = Date.now()): Promise<number> {
  const wish = await db.wish.findUnique({
    where: { id: wishId },
    include: { participant: { include: { game: true, user: { select: { id: true, name: true, avatar: true } } } } },
  });
  if (!wish || wish.secret) return 0;
  const p = wish.participant;
  if (p.game.kind !== "GIFT_LIST" || p.game.status !== "OPEN" || !p.honoree) return 0;
  // Lista en borrador: nadie más la ve todavía, así que no se avisa
  if (!p.listPublishedAt) return 0;
  const last = lastListNotice.get(p.id) ?? 0;
  if (now - last < LIST_THROTTLE_MS) return 0;
  lastListNotice.set(p.id, now);
  return notifyUsers(await participantUserIds(p.gameId, [p.user.id]), {
    title: `🎁 ${first(p.user.name)} ha añadido cosas a su lista`,
    body: `«${short(wish.title)}» · ${p.game.name}`,
    url: `/sala/${p.gameId}?zona=regalo&de=${p.id}`,
    tag: `lista-${p.id}`,
  });
}

/** Quien recibe publica su lista (deja de ser borrador) → aviso a los demás de la sala. */
export async function notifyListPublished(participantId: string, now = Date.now()): Promise<number> {
  const p = await db.participant.findUnique({
    where: { id: participantId },
    include: { game: true, user: { select: { id: true, name: true } }, _count: { select: { wishes: { where: { secret: false } } } } },
  });
  if (!p || !p.honoree || !p.listPublishedAt) return 0;
  if (p.game.kind !== "GIFT_LIST" || p.game.status !== "OPEN") return 0;
  // Lo que añada justo después no vuelve a avisar hasta pasada la media hora
  lastListNotice.set(p.id, now);
  const n = p._count.wishes;
  return notifyUsers(await participantUserIds(p.gameId, [p.user.id]), {
    title: `🎁 ${first(p.user.name)} ha publicado su lista`,
    body: `${n} idea${n === 1 ? "" : "s"} · ${p.game.name}`,
    url: `/sala/${p.gameId}?zona=regalo&de=${p.id}`,
    tag: `lista-${p.id}`,
  });
}

/** Alguien propone una idea secreta → aviso a los demás que regalan (nunca a quien recibe). */
export async function notifySecretIdea(wishId: string): Promise<number> {
  const wish = await db.wish.findUnique({
    where: { id: wishId },
    include: { addedBy: { select: { id: true, name: true } }, participant: { include: { game: true, user: { select: { id: true, name: true } } } } },
  });
  if (!wish || !wish.secret) return 0;
  const p = wish.participant;
  if (p.game.kind !== "GIFT_LIST" || p.game.status !== "OPEN") return 0;
  const except = [p.user.id, ...(wish.addedBy ? [wish.addedBy.id] : [])];
  return notifyUsers(await participantUserIds(p.gameId, except), {
    title: `🤫 ${wish.addedBy ? first(wish.addedBy.name) : "Alguien"} propone una idea para ${first(p.user.name)}`,
    body: `«${short(wish.title)}» · ${p.game.name}`,
    url: `/sala/${p.gameId}?zona=regalo&de=${p.id}`,
    tag: `idea-${p.id}`,
  });
}

/** Alguien se suma a un regalo entre varios → aviso a quienes ya estaban. */
export async function notifyJointJoined(wishId: string, joinerUserId: string): Promise<number> {
  const wish = await db.wish.findUnique({
    where: { id: wishId },
    include: {
      participant: { include: { game: true, user: { select: { id: true, name: true } } } },
      claims: {
        orderBy: { createdAt: "asc" },
        include: { participant: { include: { user: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!wish) return 0;
  const joiner = wish.claims.find((c) => c.participant.user.id === joinerUserId);
  if (!joiner || !joiner.joint) return 0;
  const owner = wish.participant.user.id;
  const others = wish.claims.map((c) => c.participant.user.id).filter((id) => id !== joinerUserId && id !== owner);
  return notifyUsers(others, {
    title: `👥 ${first(joiner.participant.user.name)} se apunta al regalo`,
    body: `«${short(wish.title)}» para ${first(wish.participant.user.name)}. Ya sois ${wish.claims.length}.`,
    url: `/sala/${wish.participant.gameId}?zona=regalo&de=${wish.participantId}`,
    tag: `varios-${wish.id}`,
  });
}

/** Sala cerrada con agradecimientos → aviso a quienes reciben. */
export async function notifyThanksReady(gameId: string): Promise<number> {
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game || !thanksVisible(game)) return 0;
  const honorees = await db.participant.findMany({
    where: { gameId, honoree: true, wishes: { some: { claims: { some: {} } } } },
    select: { userId: true },
  });
  return notifyUsers(honorees.map((h) => h.userId), {
    title: "💌 Ya puedes ver quién te regaló cada cosa",
    body: `${game.name}: entra y da las gracias.`,
    url: `/sala/${gameId}?zona=mia`,
    tag: `gracias-${gameId}`,
  });
}

// ── Recordatorios antes de la celebración ───────────────────

export const REMINDER_DAYS = [7, 3, 1] as const;
const DAY_MS = 86_400_000;

function localHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: appTimeZone() }).format(date));
}

/**
 * Recordatorios a 7, 3 y 1 días de la celebración (una vez cada uno por sala):
 * - a quien regala: cuántos regalos quedan sin pedir y cuántos le faltan por comprar;
 * - a quien recibe y aún no ha puesto nada: que apunte alguna idea.
 * Solo se envían de día. Devuelve cuántos avisos han llegado.
 */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const hour = localHour(now);
  if (hour < 10 || hour >= 21) return 0;
  const games = await db.game.findMany({
    where: {
      kind: "GIFT_LIST",
      status: "OPEN",
      eventDate: { gt: now, lte: new Date(now.getTime() + REMINDER_DAYS[0] * DAY_MS) },
    },
    select: { id: true, name: true, eventDate: true, lastReminderDays: true },
  });
  let sent = 0;
  for (const g of games) {
    const daysLeft = Math.max(1, Math.ceil((g.eventDate!.getTime() - now.getTime()) / DAY_MS));
    const threshold = [...REMINDER_DAYS].reverse().find((d) => daysLeft <= d);
    if (!threshold) continue;
    // Reserva atómica: cada tramo se envía una sola vez aunque coincidan dos pasadas
    const claimed = await db.game.updateMany({
      where: { id: g.id, OR: [{ lastReminderDays: null }, { lastReminderDays: { gt: threshold } }] },
      data: { lastReminderDays: threshold },
    });
    if (claimed.count === 0) continue;
    try {
      sent += await remindGame(g.id, g.name, daysLeft);
    } catch (e) {
      console.error("[recordatorios]", g.id, (e as Error).message);
    }
  }
  return sent;
}

async function remindGame(gameId: string, gameName: string, daysLeft: number): Promise<number> {
  const participants = await db.participant.findMany({
    where: { gameId },
    include: {
      wishes: { select: { secret: true, _count: { select: { claims: true } } } },
      claims: { select: { wish: { select: { purchased: true } } } },
    },
  });
  const when = daysLeft === 1 ? "Queda 1 día" : `Quedan ${daysLeft} días`;
  let sent = 0;
  for (const p of participants) {
    // Regalos sin pedir en las listas de los DEMÁS (nunca en la mía)
    const unclaimed = participants
      .filter((o) => o.id !== p.id && o.honoree)
      // Las ideas de una lista en borrador aún no se ven: no cuentan
      .reduce((n, o) => n + o.wishes.filter((w) => w._count.claims === 0 && (w.secret || o.listPublishedAt)).length, 0);
    const toBuy = p.claims.filter((c) => !c.wish.purchased).length;
    const emptyOwnList = p.honoree && p.wishes.every((w) => w.secret);
    const lines: string[] = [];
    if (unclaimed > 0) lines.push(unclaimed === 1 ? "Hay 1 regalo sin pedir." : `Hay ${unclaimed} regalos sin pedir.`);
    if (toBuy > 0) lines.push(toBuy === 1 ? "Te queda 1 por comprar." : `Te quedan ${toBuy} por comprar.`);
    if (emptyOwnList) lines.push("Tu lista está vacía: apunta alguna idea para que sepan qué regalarte.");
    else if (p.honoree && !p.listPublishedAt) lines.push("Tu lista sigue en borrador: publícala para que los demás la vean.");
    if (lines.length === 0) continue;
    sent += await notifyUsers([p.userId], {
      title: `⏰ ${when} · ${gameName}`,
      body: lines.join(" "),
      url: `/sala/${gameId}${unclaimed > 0 || toBuy > 0 ? "?zona=regalo" : "?zona=mia"}`,
      tag: `recordatorio-${gameId}`,
    });
  }
  return sent;
}
