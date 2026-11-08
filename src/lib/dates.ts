/** Fechas en la zona horaria de la app (por defecto Europe/Madrid). */
export function appTimeZone(): string {
  return process.env.APP_TIMEZONE || "Europe/Madrid";
}

function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** "2026-12-24T20:00" (hora local de la zona) → Date. Acepta también solo fecha. */
export function parseLocalDateTime(value: string | null | undefined, timeZone = appTimeZone()): Date | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  if (Number.isNaN(guess)) return null;
  let result = guess - offsetMs(new Date(guess), timeZone);
  // Ajuste en cambios de hora
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** Date → "2026-12-24T20:00" en la zona de la app (para <input type="datetime-local">). */
export function toLocalInput(date: Date | null | undefined, timeZone = appTimeZone()): string {
  if (!date) return "";
  const local = new Date(date.getTime() + offsetMs(date, timeZone));
  return local.toISOString().slice(0, 16);
}

export function formatDate(date: Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: appTimeZone(),
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    ...opts,
  }).format(date);
}

export function formatShortDate(date: Date | null | undefined): string {
  return formatDate(date, { weekday: undefined, hour: undefined, minute: undefined, day: "numeric", month: "short", year: "numeric" });
}
