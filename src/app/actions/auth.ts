"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import {
  loginWithCode, loginWithPin, regenerateLoginCode, setAccess, setUserRole, setupFirstAdmin, updateProfile,
} from "@/lib/services/auth";
import { deleteUserByAdmin } from "@/lib/services/users";
import { db } from "@/lib/db";
import { clientIp, endSession, getCurrentUser, requireAdmin, requireUser, safeNext, startSession } from "@/lib/session";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Entrada normal: nombre + PIN. */
export async function loginWithPinAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  if (!rateLimit(`pin:${ip}`, 20, 10 * 60_000)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
  }
  const r = await runAction(() => loginWithPin(s(fd, "name"), s(fd, "pin")));
  if (!r.ok) return r;
  await startSession(r.data!.id);
  redirect(safeNext(s(fd, "next")));
}

/** Primer acceso (o tras un reseteo): código de invitación → confirmar nombre + crear PIN. */
export async function loginWithCodeAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  if (!rateLimit(`code:${ip}`, 10, 10 * 60_000)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a probar." };
  }
  const r = await runAction(() => loginWithCode(s(fd, "code")));
  if (!r.ok) return r;
  await startSession(r.data!.id);
  const next = safeNext(s(fd, "next"));
  redirect(next === "/" ? "/acceso" : `/acceso?next=${encodeURIComponent(next)}`);
}

/** Crear o cambiar el PIN (y, en el primer acceso, confirmar el nombre) de la persona con sesión. */
export async function setAccessAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  const r = await runAction(() => setAccess(user.id, { name: fd.has("name") ? s(fd, "name") : undefined, pin: s(fd, "pin"), repeat: s(fd, "pin2") }), "PIN guardado ✓");
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  const next = s(fd, "next");
  if (next) redirect(safeNext(next));
  return { ok: true, message: r.message };
}

export async function setupAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(() =>
    setupFirstAdmin({ name: s(fd, "name"), pin: s(fd, "pin"), repeat: s(fd, "pin2"), token: s(fd, "setupToken") }),
  );
  if (!r.ok) return r;
  await startSession(r.data!.user.id);
  redirect("/perfil?bienvenida=1");
}

export async function logoutAction() {
  await endSession();
  redirect("/entrar");
}

export async function updateProfileAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(
    () =>
      updateProfile(user.id, {
        name: s(fd, "name"),
        avatar: s(fd, "avatar"),
        shirtSize: s(fd, "shirtSize"),
        pantsSize: s(fd, "pantsSize"),
        shoeSize: s(fd, "shoeSize"),
        favoriteColors: s(fd, "favoriteColors"),
        likes: s(fd, "likes"),
        dislikes: s(fd, "dislikes"),
        allergies: s(fd, "allergies"),
      }),
    "Perfil guardado ✨",
  );
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function setRoleAction(userId: string, role: "USER" | "ADMIN"): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await runAction(() => setUserRole(admin, userId, role));
  revalidatePath("/admin/usuarios");
  return r.ok ? { ok: true } : r;
}

/** Resetear acceso: borra el PIN, cierra sesiones y da un código de invitación nuevo. */
export async function regenerateUserCodeAction(userId: string): Promise<ActionResult<string>> {
  const admin = await requireAdmin();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "No existe." };
  if (target.id === admin.id) return { ok: false, error: "Tu propio PIN lo cambias desde tu perfil." };
  if (target.role === "ADMIN") return { ok: false, error: "No puedes resetear el acceso de otro admin." };
  const code = await regenerateLoginCode(userId);
  revalidatePath("/", "layout");
  return { ok: true, data: code, message: `Nuevo código de invitación: ${code}` };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await runAction(() => deleteUserByAdmin(admin, userId), "Persona eliminada con todos sus datos.");
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: r.message } : r;
}
