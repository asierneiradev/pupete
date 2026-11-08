import { describe, expect, it } from "vitest";
import { formatShortDate, parseLocalDateTime, toLocalInput } from "@/lib/dates";

describe("fechas en hora de Madrid", () => {
  it("interpreta la hora local en invierno (UTC+1) y verano (UTC+2)", () => {
    expect(parseLocalDateTime("2026-12-24T20:00", "Europe/Madrid")!.toISOString()).toBe("2026-12-24T19:00:00.000Z");
    expect(parseLocalDateTime("2026-07-01T20:00", "Europe/Madrid")!.toISOString()).toBe("2026-07-01T18:00:00.000Z");
  });

  it("acepta solo fecha y rechaza basura", () => {
    expect(parseLocalDateTime("2026-12-24", "Europe/Madrid")!.toISOString()).toBe("2026-12-23T23:00:00.000Z");
    expect(parseLocalDateTime("")).toBeNull();
    expect(parseLocalDateTime("mañana")).toBeNull();
  });

  it("ida y vuelta con el input", () => {
    const d = parseLocalDateTime("2026-12-24T20:30", "Europe/Madrid")!;
    expect(toLocalInput(d, "Europe/Madrid")).toBe("2026-12-24T20:30");
    expect(toLocalInput(null)).toBe("");
  });

  it("formatea en español", () => {
    expect(formatShortDate(new Date("2026-12-24T19:00:00Z"))).toMatch(/24 dic/);
  });
});
