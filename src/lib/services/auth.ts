/** Cuentas, códigos de invitación, nombre + PIN y sesiones (sin cookies). */
import { timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "../db";
import { decrypt, encrypt, generateLoginCode, hashPin, hmac, normalizeLoginCode, randomToken, sha256, verifyPin } from "../crypto";
import { AppError } from "../errors";

export const SESSION_DAYS = 90;

export const AVATARS = ["🦊", "🦉", "🐻", "🐰", "🦔", "🐱", "🐸", "🦌", "🐿️", "🐧", "🐼", "🐢", "🦋", "🐝", "🌻", "🍄", "🌙", "⭐", "🎈", "🧸"];

export function cleanName(name: string | null | undefined): string {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (n.length < 1) throw new AppError("Escribe un nombre.");
  if (n.length > 60) throw new AppError("El nombre es demasiado largo (máx. 60).");
  return n;
}

/**
 * Clave con la que se entra: el nombre sin mayúsculas, tildes ni signos.
 * «Iñaki», «inaki» e «IÑAKI » son lo mismo; «Maite G.» y «maite g» también.
 * (La migración 20261107230000_name_login hace lo mismo en SQL.)
 */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Nombre limpio + su clave, comprobando que nadie más se llame igual. */
export async function claimName(raw: string | null | undefined, exceptUserId?: string): Promise<{ name: string; nameKey: string }> {
  const name = cleanName(raw);
  const key = nameKey(name);
  if (!key) throw new AppError("El nombre tiene que llevar alguna letra o número.");
  const other = await db.user.findUnique({ where: { nameKey: key }, select: { id: true } });
  if (other && other.id !== exceptUserId) {
    throw new AppError(
      `Ya hay alguien en Pupete que se llama «${name}». Como el nombre sirve para entrar, añade el apellido o una inicial (p. ej. «${name} G.»).`,
    );
  }
  return { name, nameKey: key };
}

/** Genera un código único y devuelve también los campos a guardar. */
async function freshCode(): Promise<{ code: string; loginCodeHash: string; loginCodeEnc: string }> {
  for (let i = 0; i < 20; i++) {
    const code = generateLoginCode();
    const loginCodeHash = hmac(code);
    const exists = await db.user.findUnique({ where: { loginCodeHash }, select: { id: true } });
    if (!exists) return { code, loginCodeHash, loginCodeEnc: encrypt(code) };
  }
  throw new Error("No se pudo generar un código único");
}

export async function createUser(input: {
  name: string;
  role?: "USER" | "ADMIN";
  avatar?: string;
  /** Si se da, la cuenta queda ya activada (nombre + PIN). */
  pin?: string;
}): Promise<{ user: User; code: string }> {
  const { name, nameKey } = await claimName(input.name);
  const pinHash = input.pin !== undefined ? hashPin(validatePin(input.pin)) : null;
  const { code, loginCodeHash, loginCodeEnc } = await freshCode();
  const role = input.role ?? "USER";
  const avatar = input.avatar && AVATARS.includes(input.avatar) ? input.avatar : AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const user = await db.user.create({ data: { name, nameKey, role, avatar, loginCodeHash, loginCodeEnc, pinHash } });
  return { user, code };
}

export function revealLoginCode(user: Pick<User, "loginCodeEnc">): string {
  return decrypt(user.loginCodeEnc);
}

/**
 * Resetea el acceso: código de invitación nuevo y PIN borrado. La persona
 * vuelve a entrar con el código y crea un PIN nuevo.
 */
export async function regenerateLoginCode(userId: string): Promise<string> {
  const { code, loginCodeHash, loginCodeEnc } = await freshCode();
  await db.user.update({
    where: { id: userId },
    data: { loginCodeHash, loginCodeEnc, pinHash: null, pinFailed: 0, pinLockedUntil: null },
  });
  // Cerrar sesiones abiertas con el código anterior
  await db.session.deleteMany({ where: { userId } });
  return code;
}

export async function findUserByCode(input: string): Promise<User | null> {
  const code = normalizeLoginCode(input);
  if (!/^[A-Z]+-\d{4}$/.test(code)) return null;
  return db.user.findUnique({ where: { loginCodeHash: hmac(code) } });
}

/** Primer acceso con el código de invitación: solo vale mientras no haya PIN. */
export async function loginWithCode(input: string): Promise<User> {
  const user = await findUserByCode(input);
  if (!user) throw new AppError("Ese código no existe. Revisa que esté bien escrito (p. ej. PINO-4821).");
  if (user.pinHash) throw new AppError("Ese código ya se usó para crear un PIN. Entra con tu nombre y tu PIN.");
  return user;
}

// ── PIN ─────────────────────────────────────────────────────

export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MINUTES = 15;

export function hasAccess(user: Pick<User, "pinHash" | "nameKey">): boolean {
  return Boolean(user.pinHash && user.nameKey);
}

/** 4 dígitos y nada demasiado obvio (0000, 1234, 9876…). */
export function validatePin(raw: string | null | undefined, repeat?: string | null): string {
  const pin = (raw ?? "").trim();
  if (!/^\d{4}$/.test(pin)) throw new AppError("El PIN tiene que ser de 4 números.");
  if (repeat !== undefined && (repeat ?? "").trim() !== pin) throw new AppError("Los dos PIN no coinciden.");
  const d = pin.split("").map(Number);
  const same = d.every((x) => x === d[0]);
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  if (same || up || down) throw new AppError("Ese PIN es demasiado fácil de adivinar. Elige otro.");
  return pin;
}

/**
 * Crea o cambia el acceso de una persona ya identificada. Si viene `name`,
 * también fija el nombre con el que entra (tiene que ser único).
 */
export async function setAccess(userId: string, input: { name?: string; pin: string; repeat: string }): Promise<User> {
  const pin = validatePin(input.pin, input.repeat);
  const named = input.name !== undefined ? await claimName(input.name, userId) : null;
  if (!named) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { nameKey: true } });
    if (!u?.nameKey) throw new AppError("Escribe tu nombre: lo usarás para entrar junto con tu PIN.");
  }
  return db.user.update({
    where: { id: userId },
    data: { ...(named ?? {}), pinHash: hashPin(pin), pinFailed: 0, pinLockedUntil: null },
  });
}

const LOCKED = `Demasiados intentos fallidos. Espera ${PIN_LOCK_MINUTES} minutos o pide a quien organiza que te resetee el acceso.`;

/**
 * Entrar con nombre + PIN. Los mensajes son claros a propósito (lo usa gente
 * mayor): dicen si el nombre no existe o si falla el PIN. Tras
 * ${PIN_MAX_FAILS} fallos seguidos la cuenta se bloquea ${PIN_LOCK_MINUTES} minutos.
 */
export async function loginWithPin(rawName: string, rawPin: string): Promise<User> {
  const key = nameKey(rawName);
  if (!key) throw new AppError("Escribe tu nombre.");
  const pin = (rawPin ?? "").trim();
  if (!/^\d{4}$/.test(pin)) throw new AppError("El PIN son 4 números.");
  const user = await db.user.findUnique({ where: { nameKey: key } });
  if (!user) {
    verifyPin(pin, null); // mismo tiempo de respuesta
    throw new AppError("No encontramos a nadie con ese nombre. Escríbelo como aparece en Pupete (p. ej. con la inicial del apellido).");
  }
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) throw new AppError(LOCKED);
  if (!user.pinHash) throw new AppError("Aún no has creado tu PIN. Entra la primera vez con tu código de invitación.");
  if (!verifyPin(pin, user.pinHash)) {
    const fails = user.pinFailed + 1;
    const lock = fails >= PIN_MAX_FAILS;
    await db.user.update({
      where: { id: user.id },
      data: lock ? { pinFailed: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) } : { pinFailed: fails },
    });
    if (lock) throw new AppError(LOCKED);
    const left = PIN_MAX_FAILS - fails;
    throw new AppError(`PIN incorrecto. ${left === 1 ? "Te queda 1 intento" : `Te quedan ${left} intentos`} antes de esperar ${PIN_LOCK_MINUTES} minutos.`);
  }
  if (user.pinFailed || user.pinLockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { pinFailed: 0, pinLockedUntil: null } });
  }
  return user;
}

export async function needsSetup(): Promise<boolean> {
  return (await db.user.count()) === 0;
}

/** ¿Exige /setup un token de primer arranque? (variable SETUP_TOKEN) */
export function setupTokenRequired(): boolean {
  return Boolean(process.env.SETUP_TOKEN?.trim());
}

function setupTokenOk(given: string | undefined): boolean {
  const expected = process.env.SETUP_TOKEN?.trim();
  if (!expected) return true;
  const a = sha256(expected);
  const b = sha256((given ?? "").trim());
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Crea el primer administrador (solo si no existe ningún usuario).
 * Si SETUP_TOKEN está definido, hay que darlo para que nadie se adelante
 * en una instalación recién publicada.
 */
export async function setupFirstAdmin(input: { name: string; pin: string; repeat: string; token?: string }) {
  if (!(await needsSetup())) throw new AppError("La app ya está configurada.");
  if (!setupTokenOk(input.token)) throw new AppError("El token de primer arranque no es correcto.");
  const pin = validatePin(input.pin, input.repeat);
  return createUser({ name: input.name, pin, role: "ADMIN" });
}

// ── Sesiones ────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
    },
  });
  return token;
}

export async function userFromSessionToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Sesión deslizante: renovar si se ha usado tras más de un día
  if (Date.now() - session.lastSeenAt.getTime() > 86400_000) {
    await db.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
      })
      .catch(() => {});
  }
  return session.user;
}

export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

// ── Perfil ──────────────────────────────────────────────────

export interface ProfileInput {
  name: string;
  avatar?: string;
  shirtSize?: string | null;
  pantsSize?: string | null;
  shoeSize?: string | null;
  favoriteColors?: string | null;
  likes?: string | null;
  dislikes?: string | null;
  allergies?: string | null;
}

function opt(v: string | null | undefined, max: number): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (s.length > max) throw new AppError(`Algún campo es demasiado largo (máx. ${max} caracteres).`);
  return s;
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<User> {
  // El nombre es también el usuario para entrar: tiene que seguir siendo único
  const named = await claimName(input.name, userId);
  return db.user.update({
    where: { id: userId },
    data: {
      ...named,
      avatar: input.avatar && AVATARS.includes(input.avatar) ? input.avatar : undefined,
      shirtSize: opt(input.shirtSize, 20),
      pantsSize: opt(input.pantsSize, 20),
      shoeSize: opt(input.shoeSize, 20),
      favoriteColors: opt(input.favoriteColors, 120),
      likes: opt(input.likes, 500),
      dislikes: opt(input.dislikes, 500),
      allergies: opt(input.allergies, 200),
    },
  });
}

export async function setUserRole(actor: User, userId: string, role: "USER" | "ADMIN"): Promise<void> {
  if (actor.role !== "ADMIN") throw new AppError("Solo un administrador puede hacer esto.");
  if (actor.id === userId && role !== "ADMIN") throw new AppError("No puedes quitarte el rol de admin a ti mismo.");
  await db.user.update({ where: { id: userId }, data: { role } });
}
