/** Reloj interno: cada media hora mira si toca enviar recordatorios de listas de regalos. */
import { vapidPublicKey } from "./push";
import { sendDueReminders } from "./services/giftnotify";

const EVERY_MS = 30 * 60_000;
const g = globalThis as { __pupeteReminders?: boolean };

export function startReminders() {
  if (g.__pupeteReminders || process.env.NODE_ENV === "test" || process.env.REMINDERS === "off") return;
  g.__pupeteReminders = true;
  const tick = () => {
    // Sin claves VAPID no hay avisos: no gastamos consultas
    if (!vapidPublicKey()) return;
    sendDueReminders().catch((e) => console.error("[recordatorios]", (e as Error).message));
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, EVERY_MS).unref();
}
