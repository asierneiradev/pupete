import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@prisma/client";
import { createSession, deleteSession, hasAccess, SESSION_DAYS, userFromSessionToken } from "./services/auth";

export const SESSION_COOKIE = "pupete_session";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  return userFromSessionToken(store.get(SESSION_COOKIE)?.value);
});

/**
 * Exige sesión y, además, que la persona haya creado su acceso (nombre + PIN).
 * Si entró con el código de invitación y aún no tiene PIN, va a /acceso.
 */
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  if (!hasAccess(user)) redirect(next ? `/acceso?next=${encodeURIComponent(next)}` : "/acceso");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const token = await createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https"),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  await deleteSession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
}

/** IP del cliente (detrás de nginx), para el limitador de intentos. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

/** Solo rutas internas en ?next= (evita redirecciones abiertas). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
