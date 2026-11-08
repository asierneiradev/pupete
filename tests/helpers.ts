import type { AgeGroup, User } from "@prisma/client";
import { createUser, nameKey } from "@/lib/services/auth";
import { createGame, type GameInput } from "@/lib/services/games";
import { addParticipantByAdmin } from "@/lib/services/participants";
import { db } from "@/lib/db";

/** Los nombres son únicos: si ya existe ese admin en el test, se reutiliza. */
export async function makeAdmin(name = "Ana Admin"): Promise<User> {
  const existing = await db.user.findUnique({ where: { nameKey: nameKey(name) } });
  if (existing?.role === "ADMIN") return existing;
  return (await createUser({ name, role: "ADMIN" })).user;
}

export async function makeUser(name = "Pepe"): Promise<User> {
  return (await createUser({ name })).user;
}

export function gameInput(over: Partial<GameInput> = {}): GameInput {
  return {
    name: "Navidad 2026",
    signupMode: "BOTH",
    groupMode: "NONE",
    anonChat: true,
    avoidPrevious: true,
    ...over,
  };
}

/** Sala con N participantes creados por el admin. */
export async function gameWith(admin: User, people: Array<{ name: string; group?: AgeGroup }>, over: Partial<GameInput> = {}) {
  const game = await createGame(admin, gameInput(over));
  const created = [];
  for (const p of people) {
    // Si esa persona ya existe (otra sala del mismo test), se reutiliza como en «De otras salas»
    const existing = await db.user.findUnique({ where: { nameKey: nameKey(p.name) }, select: { id: true } });
    const r = await addParticipantByAdmin(admin, game.id, existing ? { existingUserId: existing.id, group: p.group ?? "ADULT" } : { name: p.name, group: p.group ?? "ADULT" });
    created.push({ ...r, name: p.name });
  }
  return { game, people: created };
}

export async function userById(id: string) {
  return db.user.findUniqueOrThrow({ where: { id } });
}

export const noPreview = async (url: string) => ({ url, title: "Producto de prueba", siteName: "tienda.test", imageUrl: "https://tienda.test/img.jpg", priceText: "19,99 €" });
