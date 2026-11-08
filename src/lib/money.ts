/** Utilidades de importes (siempre en céntimos internamente). */
export function parseEuros(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).trim().replace(/€/g, "").replace(/\s/g, "");
  if (!s) return null;
  // Acepta "12,50", "12.50", "1.200,50"
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function formatEuros(cents: number | null | undefined, currency = "EUR"): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export type BudgetStatus = "ok" | "below" | "above" | "unknown";

export function budgetStatus(
  priceCents: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): BudgetStatus {
  if (priceCents == null) return "unknown";
  if (min != null && priceCents < min) return "below";
  if (max != null && priceCents > max) return "above";
  return "ok";
}

export function budgetLabel(min: number | null | undefined, max: number | null | undefined, currency = "EUR"): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `Entre ${formatEuros(min, currency)} y ${formatEuros(max, currency)}`;
  if (max != null) return `Hasta ${formatEuros(max, currency)}`;
  return `Desde ${formatEuros(min!, currency)}`;
}
