/** Fotos de regalos subidas por los usuarios (validadas por contenido, no por extensión). */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./crypto";
import { uploadDir } from "./env";
import { AppError } from "./errors";
import { db } from "./db";

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const TYPES: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", mime: "image/webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { ext: "gif", mime: "image/gif", test: (b) => b.subarray(0, 4).toString() === "GIF8" },
];

export function detectImage(buf: Buffer) {
  return TYPES.find((t) => buf.length > 12 && t.test(buf)) ?? null;
}

/** Guarda la imagen y devuelve la URL pública relativa. */
export async function saveUpload(buf: Buffer): Promise<string> {
  if (buf.length === 0) throw new AppError("La imagen está vacía.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new AppError("La imagen pesa demasiado (máx. 3 MB).");
  const type = detectImage(buf);
  if (!type) throw new AppError("Formato no admitido: usa JPG, PNG, WEBP o GIF.");
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const name = `${randomToken(16)}.${type.ext}`;
  await writeFile(path.join(dir, name), buf);
  return `/api/uploads/${name}`;
}

const SAFE_NAME = /^[A-Za-z0-9_-]{10,64}\.(jpg|png|webp|gif)$/;

export async function readUpload(name: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!SAFE_NAME.test(name)) return null;
  try {
    const buf = await readFile(path.join(uploadDir(), name));
    const type = detectImage(buf);
    return type ? { buf, mime: type.mime } : null;
  } catch {
    return null;
  }
}

const UPLOAD_PREFIX = "/api/uploads/";

/** Nombre de fichero de una URL de foto subida, o null si es externa. */
export function uploadName(url: string | null | undefined): string | null {
  if (!url?.startsWith(UPLOAD_PREFIX)) return null;
  const name = url.slice(UPLOAD_PREFIX.length);
  return SAFE_NAME.test(name) ? name : null;
}

/**
 * Borra del disco las fotos subidas que ya no use ninguna idea (una foto puede
 * estar en varias ediciones si se copió la lista). Llamar DESPUÉS de borrar en BD.
 * Devuelve cuántos ficheros se borraron. Nunca lanza.
 */
export async function deleteUnusedUploads(urls: Array<string | null | undefined>): Promise<number> {
  const names = [...new Set(urls.map(uploadName).filter((n): n is string => Boolean(n)))];
  let removed = 0;
  for (const name of names) {
    const url = UPLOAD_PREFIX + name;
    const inUse = await db.wish.count({ where: { imageUrl: url } });
    if (inUse) continue;
    try {
      await unlink(path.join(uploadDir(), name));
      removed++;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("[uploads] no se pudo borrar", name, (e as Error).message);
    }
  }
  return removed;
}
