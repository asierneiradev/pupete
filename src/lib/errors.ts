/** Error con mensaje apto para mostrar al usuario (en español). */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

/** Ejecuta una acción y convierte AppError en un resultado mostrable. */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    // Errores de redirect/notFound de Next deben propagarse
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Algo ha fallado. Inténtalo de nuevo." };
  }
}
