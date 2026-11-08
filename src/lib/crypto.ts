import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { appSecret } from "./env";

/** Token aleatorio URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash SHA-256 para guardar tokens (sesiones, enlaces) sin poder revertirlos. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function key(purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${appSecret()}`).digest();
}

/** HMAC determinista: permite buscar por código sin guardarlo en claro. */
export function hmac(value: string): string {
  return createHmac("sha256", key("hmac")).update(value).digest("hex");
}

/** Cifrado AES-256-GCM. Formato: iv.tag.ciphertext (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("enc"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key("enc"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// Palabras cortas, sin tildes ni letras ambiguas, fáciles de dictar a un niño.
const WORDS = [
  "PINO", "ROBLE", "NUBE", "LUNA", "SOL", "RIO", "MUSGO", "BOSQUE", "FARO", "BRISA",
  "VIENTO", "NIEVE", "ZORRO", "BUHO", "CIERVO", "ARDILLA", "SETA", "HOJA", "LAGO", "MONTE",
  "ESTRELLA", "COMETA", "VELA", "LINTERNA", "TREN", "GATO", "PANDA", "TRIGO", "MIEL", "FRESA",
  "CANELA", "GALLETA", "TURRON", "BELLOTA", "ABETO", "COPO", "RENO", "TRINEO", "CAMPANA", "LAZO",
];

/** Genera un código tipo PINO-4821. */
export function generateLoginCode(): string {
  const word = WORDS[randomInt(WORDS.length)];
  const num = randomInt(1000, 10000);
  return `${word}-${num}`;
}

/** Normaliza lo que teclea el usuario: mayúsculas, sin espacios, guion opcional. */
export function normalizeLoginCode(input: string): string {
  const s = input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—_]/g, "-");
  const m = s.match(/^([A-ZÑ]+)-?(\d{4})$/);
  return m ? `${m[1]}-${m[2]}` : s;
}

// ── PIN de 4 dígitos ────────────────────────────────────────
// Con solo 10.000 combinaciones, la defensa real es el bloqueo por intentos.
// Además se mezcla con APP_SECRET (pimienta): con solo una copia de la BD no
// se pueden probar los 10.000 PIN sin el secreto.

const PIN_PREFIX = "s1";

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(hmac(`pin:${pin}`), salt, 32);
  return [PIN_PREFIX, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  // Sin hash guardado se calcula igual para no delatar por el tiempo de respuesta
  const [prefix, saltB64, hashB64] = (stored ?? "").split("$");
  const salt = prefix === PIN_PREFIX && saltB64 ? Buffer.from(saltB64, "base64url") : randomBytes(16);
  const expected = prefix === PIN_PREFIX && hashB64 ? Buffer.from(hashB64, "base64url") : randomBytes(32);
  const got = scryptSync(hmac(`pin:${pin}`), salt, 32);
  return Boolean(stored) && expected.length === got.length && timingSafeEqual(expected, got);
}
