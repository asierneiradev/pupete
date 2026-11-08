import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findUserByCode } from "@/lib/services/auth";
import { createGame, setJoinOpen } from "@/lib/services/games";
import {
  addExclusion, addParticipantByAdmin, getGameByJoinToken, joinGame, joinUrl, leaveGame, listExclusions,
  listParticipantsForAdmin, listReusableUsers, registerAndJoin, removeExclusion, removeParticipant,
  setParticipantGroup,
} from "@/lib/services/participants";
import { performDraw } from "@/lib/services/drawing";
import { gameInput, gameWith, makeAdmin, makeUser } from "./helpers";

describe("modo 2 · el admin crea a todos y reparte códigos", () => {
  it("crea la persona con código y ese código permite entrar", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput({ signupMode: "ADMIN_CREATED" }));
    const r = await addParticipantByAdmin(admin, g.id, { name: "Martina", group: "CHILD" });
    expect(r.code).toMatch(/^[A-Z]+-\d{4}$/);
    expect((await findUserByCode(r.code!))?.id).toBe(r.userId);
    const p = await db.participant.findUniqueOrThrow({ where: { id: r.participantId } });
    expect(p.group).toBe("CHILD");
  });

  it("reutiliza una cuenta existente (otra edición) sin generar código nuevo", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput());
    const existing = await makeUser("Abuelo");
    const reusable = await listReusableUsers(admin, g.id);
    expect(reusable.map((u) => u.id)).toContain(existing.id);
    const r = await addParticipantByAdmin(admin, g.id, { existingUserId: existing.id });
    expect(r.code).toBeUndefined();
    expect(r.userId).toBe(existing.id);
    expect((await listReusableUsers(admin, g.id)).map((u) => u.id)).not.toContain(existing.id);
  });

  it("si ya hay alguien con ese nombre, no crea otra cuenta y explica qué hacer", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput());
    await makeUser("Tía Rosa");
    await expect(addParticipantByAdmin(admin, g.id, { name: "tia rosa" })).rejects.toThrow(/De otras salas/);
    expect(await db.user.count({ where: { name: { startsWith: "T" } } })).toBe(1);
  });

  it("no permite duplicados ni añadir en salas de solo invitación", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput());
    const r = await addParticipantByAdmin(admin, g.id, { name: "A" });
    await expect(addParticipantByAdmin(admin, g.id, { existingUserId: r.userId })).rejects.toThrow(/ya está/);
    const inviteOnly = await createGame(admin, gameInput({ signupMode: "INVITE" }));
    await expect(addParticipantByAdmin(admin, inviteOnly.id, { name: "B" })).rejects.toThrow(/invitación/);
  });

  it("un usuario normal no puede añadir participantes", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const g = await createGame(admin, gameInput());
    await expect(addParticipantByAdmin(u, g.id, { name: "X" })).rejects.toThrow(/permiso/);
  });

  it("el panel muestra los códigos, pero no los de otros admins", async () => {
    const admin = await makeAdmin();
    const otherAdmin = await makeAdmin("Otro admin");
    const g = await createGame(admin, { ...gameInput(), joinAsParticipant: true });
    const r = await addParticipantByAdmin(admin, g.id, { name: "Niño" });
    await addParticipantByAdmin(admin, g.id, { existingUserId: otherAdmin.id });
    const list = await listParticipantsForAdmin(admin, g.id);
    expect(list.find((p) => p.userId === r.userId)!.code).toBe(r.code);
    expect(list.find((p) => p.userId === admin.id)!.code).toMatch(/-/);
    expect(list.find((p) => p.userId === otherAdmin.id)!.code).toBeNull();
  });
});

describe("modo 1 · invitación y registro", () => {
  it("una persona nueva se registra con el enlace y queda dentro con su código", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput({ signupMode: "INVITE" }));
    expect(joinUrl(g)).toBe(`https://pupete.test/unirse/${g.joinToken}`);
    expect((await getGameByJoinToken(g.joinToken))?.id).toBe(g.id);
    const r = await registerAndJoin(g.joinToken, { name: "Sofía", pin: "2580", repeat: "2580" });
    expect(r.code).toMatch(/-/);
    expect(r.participant.gameId).toBe(g.id);
    expect(r.user.nameKey).toBe("sofia");
    expect(r.user.pinHash).toBeTruthy();
  });

  it("si el nombre ya existe pide entrar primero (o añadir una inicial)", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput());
    await makeUser("Sofía");
    await expect(registerAndJoin(g.joinToken, { name: "sofia", pin: "2580", repeat: "2580" })).rejects.toThrow(/Si eres tú, entra con tu nombre y tu PIN/);
  });

  it("un usuario ya registrado se une; repetir no duplica", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput());
    const u = await makeUser();
    const r1 = await joinGame(u, g.joinToken, "CHILD");
    expect(r1.already).toBe(false);
    expect(r1.participant.group).toBe("CHILD");
    const r2 = await joinGame(u, g.joinToken);
    expect(r2.already).toBe(true);
    expect(await db.participant.count({ where: { gameId: g.id } })).toBe(1);
  });

  it("enlace inválido, inscripción cerrada o sala de solo-admin no dejan entrar", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await expect(joinGame(u, "nope")).rejects.toThrow(/no es válida/);
    expect(await getGameByJoinToken("nope")).toBeNull();
    const g = await createGame(admin, gameInput());
    await setJoinOpen(admin, g.id, false);
    await expect(joinGame(u, g.joinToken)).rejects.toThrow(/cerrada/);
    await expect(registerAndJoin(g.joinToken, { name: "X", pin: "2580", repeat: "2580" })).rejects.toThrow(/cerrada/);
    const adminOnly = await createGame(admin, gameInput({ signupMode: "ADMIN_CREATED" }));
    await expect(joinGame(u, adminOnly.joinToken)).rejects.toThrow(/código/);
  });

  it("no se puede unir después del sorteo", async () => {
    const admin = await makeAdmin();
    const { game } = await gameWith(admin, [{ name: "A" }, { name: "B" }, { name: "C" }]);
    await performDraw(admin, game.id);
    await setJoinOpen(admin, game.id, true);
    const u = await makeUser();
    await expect(joinGame(u, game.joinToken)).rejects.toThrow(/sorteo/);
  });
});

describe("cambios de participantes", () => {
  it("quitar, salir y cambiar de grupo solo antes del sorteo", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]);
    await setParticipantGroup(admin, game.id, people[0].participantId, "CHILD");
    expect((await db.participant.findUniqueOrThrow({ where: { id: people[0].participantId } })).group).toBe("CHILD");
    await setParticipantGroup(admin, game.id, people[0].participantId, "ADULT");
    await removeParticipant(admin, game.id, people[3].participantId);
    const userC = await db.user.findUniqueOrThrow({ where: { id: people[2].userId } });
    await leaveGame(userC, game.id);
    expect(await db.participant.count({ where: { gameId: game.id } })).toBe(2);
    await addParticipantByAdmin(admin, game.id, { name: "E" });
    await performDraw(admin, game.id);
    await expect(removeParticipant(admin, game.id, people[0].participantId)).rejects.toThrow(/sorteo/);
    await expect(setParticipantGroup(admin, game.id, people[0].participantId, "CHILD")).rejects.toThrow(/sorteo/);
  });

  it("no se puede quitar a alguien de otra sala", async () => {
    const admin = await makeAdmin();
    const a = await gameWith(admin, [{ name: "A" }]);
    const b = await gameWith(admin, [{ name: "B" }]);
    await expect(removeParticipant(admin, a.game.id, b.people[0].participantId)).rejects.toThrow(/no está/);
  });
});

describe("exclusiones", () => {
  it("añade, lista y quita; sin duplicados ni autoexclusión", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [{ name: "A" }, { name: "B" }, { name: "C" }]);
    const [a, b] = people.map((p) => p.participantId);
    await addExclusion(admin, game.id, a, b);
    await expect(addExclusion(admin, game.id, b, a)).rejects.toThrow(/ya existe/);
    await expect(addExclusion(admin, game.id, a, a)).rejects.toThrow(/distintas/);
    const list = await listExclusions(game.id);
    expect(list).toHaveLength(1);
    await removeExclusion(admin, game.id, list[0].id);
    expect(await listExclusions(game.id)).toHaveLength(0);
  });

  it("solo con personas de la propia sala", async () => {
    const admin = await makeAdmin();
    const x = await gameWith(admin, [{ name: "A" }, { name: "B" }]);
    const y = await gameWith(admin, [{ name: "C" }]);
    await expect(addExclusion(admin, x.game.id, x.people[0].participantId, y.people[0].participantId)).rejects.toThrow(/estar en la sala/);
  });
});
