import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createSession, createUser, deleteSession, findUserByCode, needsSetup,
  regenerateLoginCode, revealLoginCode, setUserRole, setupFirstAdmin,
  updateProfile, userFromSessionToken,
} from "@/lib/services/auth";
import { sha256 } from "@/lib/crypto";
import { makeAdmin, makeUser } from "./helpers";

describe("primer arranque (/setup)", () => {
  it("crea el primer admin solo si no hay usuarios", async () => {
    expect(await needsSetup()).toBe(true);
    const { user, code } = await setupFirstAdmin({ name: "Maite", pin: "2580", repeat: "2580" });
    expect(user.pinHash).toBeTruthy();
    expect(user.role).toBe("ADMIN");
    expect(user.nameKey).toBe("maite");
    expect(code).toMatch(/^[A-Z]+-\d{4}$/);
    expect(await needsSetup()).toBe(false);
    await expect(setupFirstAdmin({ name: "Intruso", pin: "2580", repeat: "2580" })).rejects.toThrow(/ya está configurada/);
  });

  it("con SETUP_TOKEN, exige el token correcto", async () => {
    process.env.SETUP_TOKEN = "token-de-arranque";
    try {
      await expect(setupFirstAdmin({ name: "Intruso", pin: "2580", repeat: "2580" })).rejects.toThrow(/token/);
      await expect(setupFirstAdmin({ name: "Intruso", pin: "2580", repeat: "2580", token: "otro" })).rejects.toThrow(/token/);
      expect(await needsSetup()).toBe(true);
      const { user } = await setupFirstAdmin({ name: "Maite", pin: "2580", repeat: "2580", token: " token-de-arranque " });
      expect(user.role).toBe("ADMIN");
    } finally {
      delete process.env.SETUP_TOKEN;
    }
  });
});

describe("cuentas y códigos de acceso", () => {
  it("crea usuario con código, y se puede entrar con él (sin importar mayúsculas/espacios)", async () => {
    const { user, code } = await createUser({ name: "  Lucía   Pérez " });
    expect(user.name).toBe("Lucía Pérez");
    expect(user.nameKey).toBe("lucia perez");
    expect(user.loginCodeHash).not.toContain(code);
    expect((await findUserByCode(code.toLowerCase().replace("-", " ")))?.id).toBe(user.id);
    expect(revealLoginCode(user)).toBe(code);
  });

  it("código incorrecto no entra", async () => {
    await makeUser();
    expect(await findUserByCode("NADA-0000")).toBeNull();
    expect(await findUserByCode("basura")).toBeNull();
  });

  it("nombres vacíos, sin letras o repetidos fallan con mensaje claro", async () => {
    await createUser({ name: "Ane" });
    await expect(createUser({ name: "ANE" })).rejects.toThrow(/Ya hay alguien/);
    await expect(createUser({ name: "   " })).rejects.toThrow(/nombre/);
    await expect(createUser({ name: "🎄🎁" })).rejects.toThrow(/alguna letra o número/);
  });

  it("regenerar el código invalida el anterior y cierra sesiones", async () => {
    const { user, code } = await createUser({ name: "Iker" });
    const token = await createSession(user.id);
    const newCode = await regenerateLoginCode(user.id);
    expect(newCode).not.toBe(code);
    expect(await findUserByCode(code)).toBeNull();
    expect((await findUserByCode(newCode))?.id).toBe(user.id);
    expect(await userFromSessionToken(token)).toBeNull();
  });
});

describe("sesiones", () => {
  it("crea, recupera y cierra sesión; el token no se guarda en claro", async () => {
    const u = await makeUser();
    const token = await createSession(u.id);
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
    expect(await db.session.count({ where: { tokenHash: sha256(token) } })).toBe(1);
    expect((await userFromSessionToken(token))?.id).toBe(u.id);
    await deleteSession(token);
    expect(await userFromSessionToken(token)).toBeNull();
  });

  it("las sesiones caducadas no valen y se borran", async () => {
    const u = await makeUser();
    const token = await createSession(u.id);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await userFromSessionToken(token)).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("token vacío o inventado devuelve null", async () => {
    expect(await userFromSessionToken(undefined)).toBeNull();
    expect(await userFromSessionToken("inventado")).toBeNull();
  });

  it("renueva la caducidad si la sesión lleva más de un día sin usarse", async () => {
    const u = await makeUser();
    const token = await createSession(u.id);
    const old = new Date(Date.now() - 3 * 86400_000);
    await db.session.updateMany({ data: { lastSeenAt: old, expiresAt: new Date(Date.now() + 86400_000) } });
    await userFromSessionToken(token);
    const s = await db.session.findFirstOrThrow();
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 80 * 86400_000);
  });
});

describe("perfil", () => {
  it("guarda la ficha personal", async () => {
    const u = await makeUser();
    const updated = await updateProfile(u.id, {
      name: "Pepe G.", avatar: "🦉", shirtSize: "M", shoeSize: "42",
      favoriteColors: "verde", likes: "café, montaña", dislikes: "perfumes", allergies: "frutos secos",
    });
    expect(updated).toMatchObject({ name: "Pepe G.", nameKey: "pepe g", avatar: "🦉", shirtSize: "M", shoeSize: "42", allergies: "frutos secos" });
  });

  it("ignora avatares no permitidos y valida longitudes y nombres ajenos", async () => {
    await makeUser("Otra");
    const u = await makeUser();
    const before = u.avatar;
    const r = await updateProfile(u.id, { name: "Pepe", avatar: "<script>" });
    expect(r.avatar).toBe(before);
    await expect(updateProfile(u.id, { name: "Pepe", likes: "x".repeat(501) })).rejects.toThrow(/demasiado largo/);
    await expect(updateProfile(u.id, { name: "otra" })).rejects.toThrow(/Ya hay alguien/);
  });
});

describe("roles", () => {
  it("solo un admin cambia roles y no puede quitarse el suyo", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await expect(setUserRole(u, admin.id, "USER")).rejects.toThrow(/administrador/);
    await setUserRole(admin, u.id, "ADMIN");
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).role).toBe("ADMIN");
    await expect(setUserRole(admin, admin.id, "USER")).rejects.toThrow(/ti mismo/);
  });
});
