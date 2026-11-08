import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  canManage, createGame, createNextEdition, deleteGame, finishGame, listGamesForUser,
  rotateJoinToken, setJoinOpen, updateGame,
} from "@/lib/services/games";
import { addExclusion } from "@/lib/services/participants";
import { performDraw } from "@/lib/services/drawing";
import { gameInput, gameWith, makeAdmin, makeUser } from "./helpers";

describe("crear sala", () => {
  it("un admin crea una sala con toda la configuración", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput({
      name: "  Navidad familia  ", budgetMin: 1000, budgetMax: 3000, groupMode: "SEPARATE",
      signupMode: "INVITE", anonChat: false, location: "Casa de la abuela", eventDate: new Date("2026-12-24T20:00:00Z"),
      cover: "nieve",
    }));
    expect(g).toMatchObject({ name: "Navidad familia", budgetMin: 1000, budgetMax: 3000, groupMode: "SEPARATE", signupMode: "INVITE", anonChat: false, status: "OPEN", cover: "nieve", joinOpen: true });
    expect(g.joinToken.length).toBeGreaterThan(15);
  });

  it("el admin puede apuntarse como participante al crearla", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, { ...gameInput(), joinAsParticipant: true });
    expect(await db.participant.count({ where: { gameId: g.id, userId: admin.id } })).toBe(1);
  });

  it("un usuario normal no puede crear salas", async () => {
    const u = await makeUser();
    await expect(createGame(u, gameInput())).rejects.toThrow(/administrador/);
  });

  it("valida nombre, presupuesto y portada", async () => {
    const admin = await makeAdmin();
    await expect(createGame(admin, gameInput({ name: " " }))).rejects.toThrow(/nombre/);
    await expect(createGame(admin, gameInput({ budgetMin: 5000, budgetMax: 1000 }))).rejects.toThrow(/mínimo/);
    const g = await createGame(admin, gameInput({ cover: "inventada" }));
    expect(g.cover).toBe("bosque");
  });
});

describe("gestionar sala", () => {
  it("actualiza configuración; un usuario normal no puede", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const g = await createGame(admin, gameInput());
    const up = await updateGame(admin, g.id, gameInput({ name: "Reyes", budgetMax: 2500 }));
    expect(up).toMatchObject({ name: "Reyes", budgetMax: 2500 });
    await expect(updateGame(u, g.id, gameInput())).rejects.toThrow(/permiso/);
    expect(canManage(u, g)).toBe(false);
    expect(canManage(admin, g)).toBe(true);
  });

  it("no deja cambiar los grupos tras el sorteo", async () => {
    const admin = await makeAdmin();
    const { game } = await gameWith(admin, [{ name: "A" }, { name: "B" }, { name: "C" }]);
    await performDraw(admin, game.id);
    await expect(updateGame(admin, game.id, gameInput({ groupMode: "SEPARATE" }))).rejects.toThrow(/grupos/);
    await expect(updateGame(admin, game.id, gameInput({ name: "Otro nombre" }))).resolves.toBeTruthy();
  });

  it("abre/cierra inscripción y cambia el enlace de invitación", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput());
    await setJoinOpen(admin, g.id, false);
    expect((await db.game.findUniqueOrThrow({ where: { id: g.id } })).joinOpen).toBe(false);
    const t = await rotateJoinToken(admin, g.id);
    expect(t).not.toBe(g.joinToken);
  });

  it("cerrar sala solo tras el sorteo", async () => {
    const admin = await makeAdmin();
    const { game } = await gameWith(admin, [{ name: "A" }, { name: "B" }, { name: "C" }]);
    await expect(finishGame(admin, game.id)).rejects.toThrow(/sorteada/);
    await performDraw(admin, game.id);
    await finishGame(admin, game.id);
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe("FINISHED");
  });

  it("borrar pide escribir el nombre exacto", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput({ name: "Borrable" }));
    await expect(deleteGame(admin, g.id, "otra")).rejects.toThrow(/nombre exacto/);
    await deleteGame(admin, g.id, "Borrable");
    expect(await db.game.count()).toBe(0);
  });
});

describe("nueva edición (reutilizar cada año)", () => {
  it("copia configuración, personas, grupos y exclusiones, y enlaza con la anterior", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(
      admin,
      [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "K1", group: "CHILD" }, { name: "K2", group: "CHILD" }],
      { groupMode: "SEPARATE", budgetMax: 3000 },
    );
    await addExclusion(admin, game.id, people[0].participantId, people[1].participantId);
    const next = await createNextEdition(admin, game.id, "Navidad 2027");
    expect(next).toMatchObject({ name: "Navidad 2027", groupMode: "SEPARATE", budgetMax: 3000, previousGameId: game.id, avoidPrevious: true, status: "OPEN" });
    const ps = await db.participant.findMany({ where: { gameId: next.id } });
    expect(ps).toHaveLength(5);
    expect(ps.filter((p) => p.group === "CHILD")).toHaveLength(2);
    expect(await db.exclusion.count({ where: { gameId: next.id } })).toBe(1);
    expect(next.joinToken).not.toBe(game.joinToken);
  });
});

describe("listado", () => {
  it("un usuario ve las salas donde participa; un admin además todas", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [{ name: "A" }, { name: "B" }, { name: "C" }]);
    await createGame(admin, gameInput({ name: "Otra" }));
    const user = await db.user.findUniqueOrThrow({ where: { id: people[0].userId } });
    const mine = await listGamesForUser(user);
    expect(mine.participating.map((g) => g.id)).toEqual([game.id]);
    expect(mine.managed).toHaveLength(0);
    expect((await listGamesForUser(admin)).managed).toHaveLength(2);
  });
});
