import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createUser, setUserRole } from "@/lib/services/auth";
import { canManage, createGame, deleteGame, getManagedGame, listGamesForUser, updateGame } from "@/lib/services/games";
import { addParticipantByAdmin, joinGame, listParticipantsForAdmin, listReusableUsers } from "@/lib/services/participants";
import { deleteUserByAdmin, listPeople, resetUserAccess } from "@/lib/services/users";
import { performDraw } from "@/lib/services/drawing";
import { gameInput, gameWith, makeAdmin, makeUser, userById } from "./helpers";

/** Asier es admin y Sandra organizadora; cada uno tiene su sala con su gente. */
async function setup() {
  const asier = await makeAdmin("Asier");
  const sandra = (await createUser({ name: "Sandra", role: "ORGANIZER" })).user;
  const mine = await gameWith(asier, [{ name: "Amama" }, { name: "Aitite" }], { name: "Navidad de Asier" });
  const hers = await gameWith(sandra, [{ name: "Lucía" }, { name: "Marcos" }], { name: "Cumple de Sandra" });
  return { asier, sandra, mine, hers };
}

const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name).sort();

describe("organizadores · salas", () => {
  it("un organizador crea salas; un participante no", async () => {
    const sandra = (await createUser({ name: "Sandra", role: "ORGANIZER" })).user;
    const g = await createGame(sandra, gameInput());
    expect(g.ownerId).toBe(sandra.id);
    await expect(createGame(await makeUser("Pepe"), gameInput())).rejects.toThrow(/administrador u organizador/);
  });

  it("cada uno ve y gestiona solo sus salas, también el admin", async () => {
    const { asier, sandra, mine, hers } = await setup();
    expect(names((await listGamesForUser(asier)).managed)).toEqual(["Navidad de Asier"]);
    expect(names((await listGamesForUser(sandra)).managed)).toEqual(["Cumple de Sandra"]);
    expect(canManage(asier, hers.game)).toBe(false);
    expect(canManage(sandra, mine.game)).toBe(false);
    for (const [who, game] of [[asier, hers.game], [sandra, mine.game]] as const) {
      await expect(getManagedGame(who, game.id)).rejects.toThrow(/permiso/);
      await expect(updateGame(who, game.id, gameInput({ name: "Mía" }))).rejects.toThrow(/permiso/);
      await expect(listParticipantsForAdmin(who, game.id)).rejects.toThrow(/permiso/);
      await expect(addParticipantByAdmin(who, game.id, { name: "Intruso" })).rejects.toThrow(/permiso/);
      await expect(performDraw(who, game.id)).rejects.toThrow(/permiso/);
      await expect(deleteGame(who, game.id, game.name)).rejects.toThrow(/permiso/);
    }
    expect(await db.game.count()).toBe(2);
  });

  it("si participa en la sala de otro la ve como participante, sin gestionarla", async () => {
    const { asier, sandra, mine } = await setup();
    await joinGame(sandra, mine.game.joinToken);
    const { participating, managed } = await listGamesForUser(sandra);
    expect(names(participating)).toEqual(["Navidad de Asier"]);
    expect(names(managed)).toEqual(["Cumple de Sandra"]);
    expect(canManage(sandra, mine.game)).toBe(false);
    expect(canManage(asier, mine.game)).toBe(true);
  });

  it("quien deja de ser organizador conserva sus salas, pero no crea más", async () => {
    const { asier, sandra, hers } = await setup();
    await setUserRole(asier, sandra.id, "USER");
    const demoted = await userById(sandra.id);
    expect(canManage(demoted, hers.game)).toBe(true);
    await expect(createGame(demoted, gameInput())).rejects.toThrow(/organizador/);
  });

  it("solo un admin reparte permisos", async () => {
    const { asier, sandra } = await setup();
    const pepe = await makeUser("Pepe");
    await expect(setUserRole(sandra, pepe.id, "ORGANIZER")).rejects.toThrow(/administrador/);
    await setUserRole(asier, pepe.id, "ORGANIZER");
    expect((await userById(pepe.id)).role).toBe("ORGANIZER");
    await expect(setUserRole(asier, asier.id, "ORGANIZER")).rejects.toThrow(/ti mismo/);
  });
});

describe("organizadores · personas", () => {
  it("cada uno ve solo a la gente de sus salas; el admin ve además quién organiza", async () => {
    const { asier, sandra } = await setup();
    const forSandra = await listPeople(sandra);
    expect(names(forSandra.people)).toEqual(["Lucía", "Marcos", "Sandra"]);
    expect(forSandra.hiddenCount).toBe(0);
    const forAsier = await listPeople(asier);
    expect(names(forAsier.people)).toEqual(["Aitite", "Amama", "Asier", "Sandra"]);
    expect(forAsier.hiddenCount).toBe(2);
    // Ver todo es una opción aparte, solo del admin
    expect((await listPeople(asier, { all: true })).people).toHaveLength(6);
    expect(names((await listPeople(sandra, { all: true })).people)).toEqual(["Lucía", "Marcos", "Sandra"]);
    await expect(listPeople(await makeUser("Pepe"))).rejects.toThrow(/administrador/);
  });

  it("«De otras salas» solo ofrece gente de mis salas, y no se puede añadir a nadie de las de otro", async () => {
    const { asier, sandra, mine, hers } = await setup();
    const nueva = await createGame(sandra, gameInput({ name: "Reyes de Sandra" }));
    expect(names(await listReusableUsers(sandra, nueva.id))).toEqual(["Lucía", "Marcos", "Sandra"]);
    await expect(addParticipantByAdmin(sandra, nueva.id, { existingUserId: mine.people[0].userId })).rejects.toThrow(/no existe/);
    await addParticipantByAdmin(sandra, nueva.id, { existingUserId: hers.people[0].userId });
    const deAsier = await createGame(asier, gameInput({ name: "Reyes de Asier" }));
    expect(names(await listReusableUsers(asier, deAsier.id))).toEqual(["Aitite", "Amama", "Asier"]);
  });

  it("un organizador resetea y elimina a su gente, no a la de otro", async () => {
    const { sandra, mine, hers } = await setup();
    expect(await resetUserAccess(sandra, hers.people[0].userId)).toMatch(/^[A-Z]+-\d{4}$/);
    await expect(resetUserAccess(sandra, mine.people[0].userId)).rejects.toThrow(/no existe/);
    await expect(deleteUserByAdmin(sandra, mine.people[0].userId)).rejects.toThrow(/no existe/);
    await deleteUserByAdmin(sandra, hers.people[1].userId);
    expect(await db.user.count({ where: { name: "Marcos" } })).toBe(0);
    expect(await db.user.count({ where: { name: "Amama" } })).toBe(1);
  });

  it("una persona compartida con otro organizador solo la toca un admin", async () => {
    const { asier, sandra, mine, hers } = await setup();
    const lucia = await userById(hers.people[0].userId);
    await joinGame(lucia, mine.game.joinToken);
    expect((await listPeople(sandra)).people.find((p) => p.name === "Lucía")).toMatchObject({ canManage: false, code: null });
    await expect(resetUserAccess(sandra, lucia.id)).rejects.toThrow(/otro organizador/);
    await expect(deleteUserByAdmin(sandra, lucia.id)).rejects.toThrow(/otro organizador/);
    expect((await listPeople(asier)).people.find((p) => p.name === "Lucía")).toMatchObject({ canManage: true, myGames: 1 });
    expect(await resetUserAccess(asier, lucia.id)).toMatch(/-/);
  });

  it("nadie resetea ni elimina a quien organiza salas, ni a sí mismo", async () => {
    const { asier, sandra, hers } = await setup();
    await expect(resetUserAccess(asier, sandra.id)).rejects.toThrow(/Quítale antes/);
    await expect(deleteUserByAdmin(asier, sandra.id)).rejects.toThrow(/Quítale antes/);
    await expect(resetUserAccess(sandra, sandra.id)).rejects.toThrow(/perfil/);
    await joinGame(asier, hers.game.joinToken);
    await expect(resetUserAccess(sandra, asier.id)).rejects.toThrow(/solo un administrador/);
    const row = (await listParticipantsForAdmin(sandra, hers.game.id)).find((p) => p.userId === asier.id)!;
    expect(row.code).toBeNull();
  });
});
