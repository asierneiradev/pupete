/** Acceso centralizado a variables de entorno. */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_SECRET debe tener al menos 32 caracteres");
    }
    return "dev-only-secret-change-me-dev-only-secret";
  }
  return s;
}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || "./data/uploads";
}
