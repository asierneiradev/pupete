import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateLoginCode, hmac, normalizeLoginCode, randomToken, sha256 } from "@/lib/crypto";
import { budgetLabel, budgetStatus, formatEuros, parseEuros } from "@/lib/money";

describe("crypto", () => {
  it("cifra y descifra", () => {
    const enc = encrypt("PINO-1234");
    expect(enc).not.toContain("PINO");
    expect(decrypt(enc)).toBe("PINO-1234");
  });

  it("cada cifrado es distinto (IV aleatorio)", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  it("detecta manipulación del cifrado", () => {
    const [iv, tag, data] = encrypt("hola").split(".");
    const tampered = [iv, tag, Buffer.from("adios").toString("base64url")].join(".");
    expect(() => decrypt(tampered)).toThrow();
    expect(data).toBeTruthy();
  });

  it("hmac y sha256 son deterministas", () => {
    expect(hmac("a")).toBe(hmac("a"));
    expect(hmac("a")).not.toBe(sha256("a"));
  });

  it("tokens aleatorios únicos y URL-safe", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t).not.toBe(randomToken());
  });

  it("los códigos tienen formato PALABRA-1234 sin letras raras", () => {
    for (let i = 0; i < 200; i++) expect(generateLoginCode()).toMatch(/^[A-Z]+-\d{4}$/);
  });

  it("normaliza lo que teclea la gente", () => {
    expect(normalizeLoginCode(" pino-1234 ")).toBe("PINO-1234");
    expect(normalizeLoginCode("pino 1234")).toBe("PINO-1234");
    expect(normalizeLoginCode("PINO1234")).toBe("PINO-1234");
    expect(normalizeLoginCode("pino—1234")).toBe("PINO-1234");
  });
});

describe("money", () => {
  it("interpreta importes en formato español", () => {
    expect(parseEuros("12,50")).toBe(1250);
    expect(parseEuros("12.50")).toBe(1250);
    expect(parseEuros("1.200,50 €")).toBe(120050);
    expect(parseEuros("30")).toBe(3000);
    expect(parseEuros("")).toBeNull();
    expect(parseEuros("abc")).toBeNull();
    expect(parseEuros("-5")).toBeNull();
  });

  it("formatea en euros", () => {
    expect(formatEuros(2000)).toMatch(/20\s?€/);
    expect(formatEuros(1999)).toMatch(/19,99\s?€/);
    expect(formatEuros(null)).toBe("");
  });

  it("compara con el presupuesto", () => {
    expect(budgetStatus(1500, 1000, 3000)).toBe("ok");
    expect(budgetStatus(500, 1000, 3000)).toBe("below");
    expect(budgetStatus(5000, 1000, 3000)).toBe("above");
    expect(budgetStatus(null, 1000, 3000)).toBe("unknown");
    expect(budgetStatus(5000, null, null)).toBe("ok");
  });

  it("describe el rango", () => {
    expect(budgetLabel(1000, 3000)).toMatch(/Entre 10\s?€ y 30\s?€/);
    expect(budgetLabel(null, 3000)).toMatch(/Hasta 30\s?€/);
    expect(budgetLabel(1000, null)).toMatch(/Desde 10\s?€/);
    expect(budgetLabel(null, null)).toBeNull();
  });
});
