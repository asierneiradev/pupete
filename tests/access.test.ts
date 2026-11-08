import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPin, verifyPin } from "@/lib/crypto";
import {
  createSession, createUser, hasAccess, loginWithCode, loginWithPin, nameKey, PIN_MAX_FAILS, regenerateLoginCode, setAccess,
  updateProfile, userFromSessionToken, validatePin,
} from "@/lib/services/auth";
import { deleteUserByAdmin } from "@/lib/services/users";
import { addWish, deleteWish, setWantsSurprise, copyWishesFrom, myListState } from "@/lib/services/wishes";
import { checkDraw, getMyReceivers, performDraw } from "@/lib/services/drawing";
import { createGame } from "@/lib/services/games";
import { addParticipantByAdmin, joinGame, listParticipantsForAdmin, registerAndJoin } from "@/lib/services/participants";
import { saveSubscription } from "@/lib/push";
import { saveUpload } from "@/lib/uploads";
import { uploadDir } from "@/lib/env";
import { gameInput, gameWith, makeAdmin, makeUser, noPreview, userById } from "./helpers";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const onDisk = (url: string) => existsSync(path.join(uploadDir(), url.split("/").pop()!));

describe("PIN de 4 dígitos", () => {
  it("valida formato, repetición y PIN obvios", () => {
    expect(validatePin("2580")).toBe("2580");
    expect(validatePin(" 7391 ", "7391")).toBe("7391");
    for (const bad of ["123", "12345", "12a4", "", "١٢٣٤"]) expect(() => validatePin(bad)).toThrow(/4 números/);
    expect(() => validatePin("2580", "2581")).toThrow(/no coinciden/);
    for (const easy of ["0000", "1111", "1234", "6789", "4321", "9876"]) expect(() => validatePin(easy)).toThrow(/fácil/);
  });

  it("se guarda con hash y sal (nunca en claro, dos hashes distintos)", () => {
    const a = hashPin("2580");
    const b = hashPin("2580");
    expect(a).not.toContain("2580");
    expect(a).not.toBe(b);
    expect(verifyPin("2580", a)).toBe(true);
    expect(verifyPin("2581", a)).toBe(false);
    expect(verifyPin("2580", null)).toBe(false);
    expect(verifyPin("2580", "basura")).toBe(false);
  });
});

describe("acceso con nombre + PIN", () => {
  async function withPin(name = "Iñaki Etxeberria") {
    const { user, code } = await createUser({ name });
    await setAccess(user.id, { pin: "2580", repeat: "2580" });
    return { user: await userById(user.id), code };
  }

  it("la clave del nombre ignora mayúsculas, tildes, espacios y signos", () => {
    expect(nameKey("  Iñaki   Etxeberría ")).toBe("inaki etxeberria");
    expect(nameKey("MAITE G.")).toBe("maite g");
    expect(nameKey("maite-g")).toBe("maite g");
    expect(nameKey("Ánxela")).toBe(nameKey("anxela"));
    expect(nameKey("🎄")).toBe("");
  });

  it("entra con el nombre escrito de cualquier manera y el PIN", async () => {
    const { user } = await withPin();
    for (const typed of ["Iñaki Etxeberria", "inaki etxeberria", "  IÑAKI  ETXEBERRÍA "]) {
      expect((await loginWithPin(typed, "2580")).id).toBe(user.id);
    }
  });

  it("mensajes claros: nombre que no existe, PIN mal escrito, PIN incorrecto con intentos restantes", async () => {
    await withPin();
    await expect(loginWithPin("Nadie", "2580")).rejects.toThrow(/No encontramos a nadie/);
    await expect(loginWithPin("", "2580")).rejects.toThrow(/Escribe tu nombre/);
    await expect(loginWithPin("Iñaki Etxeberria", "25")).rejects.toThrow(/4 números/);
    await expect(loginWithPin("Iñaki Etxeberria", "9999")).rejects.toThrow(`Te quedan ${PIN_MAX_FAILS - 1} intentos`);
  });

  it(`bloquea tras ${PIN_MAX_FAILS} fallos aunque luego acierte, y un acierto resetea el contador`, async () => {
    const { user } = await withPin();
    const n = "inaki etxeberria";
    for (let i = 0; i < PIN_MAX_FAILS - 1; i++) await expect(loginWithPin(n, "1357")).rejects.toThrow(/PIN incorrecto/);
    await loginWithPin(n, "2580"); // acierta: resetea
    expect((await userById(user.id)).pinFailed).toBe(0);
    for (let i = 0; i < PIN_MAX_FAILS - 1; i++) await expect(loginWithPin(n, "1357")).rejects.toThrow(/PIN incorrecto/);
    await expect(loginWithPin(n, "1357")).rejects.toThrow(/Demasiados intentos/);
    await expect(loginWithPin(n, "2580")).rejects.toThrow(/Demasiados intentos/);
    // Pasado el bloqueo vuelve a entrar
    await db.user.update({ where: { id: user.id }, data: { pinLockedUntil: new Date(Date.now() - 1000) } });
    expect((await loginWithPin(n, "2580")).id).toBe(user.id);
  });

  it("no puede haber dos personas con el mismo nombre (aunque cambien mayúsculas o tildes)", async () => {
    const admin = await makeAdmin();
    const g = await createGame(admin, gameInput());
    await createUser({ name: "Maite" });
    await expect(createUser({ name: "maité" })).rejects.toThrow(/Ya hay alguien en Pupete que se llama «maité»/);
    await expect(addParticipantByAdmin(admin, g.id, { name: "MAITE" })).rejects.toThrow(/De otras salas/);
    await expect(registerAndJoin(g.joinToken, { name: " Maite ", pin: "2580", repeat: "2580" })).rejects.toThrow(/Si eres tú, entra/);
    // Con una inicial sí
    const { user } = await registerAndJoin(g.joinToken, { name: "Maite G.", pin: "2580", repeat: "2580" });
    expect((await loginWithPin("maite g", "2580")).id).toBe(user.id);
    // Cambiar el nombre en el perfil también lo comprueba (y actualiza el acceso)
    await expect(updateProfile(user.id, { name: "Maite" })).rejects.toThrow(/Ya hay alguien/);
    await updateProfile(user.id, { name: "Maite Goñi" });
    expect((await loginWithPin("maite goni", "2580")).id).toBe(user.id);
    await expect(loginWithPin("maite g", "2580")).rejects.toThrow(/No encontramos/);
  });

  it("el código de invitación sirve solo hasta crear el PIN", async () => {
    const { user, code } = await createUser({ name: "Iker" });
    expect((await loginWithCode(code.toLowerCase())).id).toBe(user.id);
    await expect(loginWithPin("Iker", "2580")).rejects.toThrow(/código de invitación/);
    await setAccess(user.id, { pin: "2580", repeat: "2580" });
    await expect(loginWithCode(code)).rejects.toThrow(/ya se usó/);
    await expect(loginWithCode("NADA-0000")).rejects.toThrow(/no existe/);
  });

  it("en el primer acceso se puede cambiar el nombre, que debe estar libre; el PIN debe ser válido", async () => {
    await createUser({ name: "Otra" });
    const { user } = await createUser({ name: "Iker" });
    await expect(setAccess(user.id, { name: "", pin: "2580", repeat: "2580" })).rejects.toThrow(/Escribe un nombre/);
    await expect(setAccess(user.id, { name: "otra", pin: "2580", repeat: "2580" })).rejects.toThrow(/Ya hay alguien/);
    await expect(setAccess(user.id, { name: "Iker", pin: "1234", repeat: "1234" })).rejects.toThrow(/fácil/);
    await setAccess(user.id, { name: "Iker Z.", pin: "2580", repeat: "2580" });
    expect((await loginWithPin("iker z", "2580")).name).toBe("Iker Z.");
  });

  it("una cuenta sin nombre de acceso (duplicado de antes de la migración) tiene que elegir uno", async () => {
    const { user } = await createUser({ name: "Ane" });
    await db.user.update({ where: { id: user.id }, data: { nameKey: null, pinHash: hashPin("2580") } });
    expect(hasAccess(await userById(user.id))).toBe(false);
    await expect(setAccess(user.id, { pin: "2580", repeat: "2580" })).rejects.toThrow(/Escribe tu nombre/);
    await setAccess(user.id, { name: "Ane B.", pin: "2580", repeat: "2580" });
    expect(hasAccess(await userById(user.id))).toBe(true);
  });

  it("resetear el acceso borra el PIN, cierra sesiones y da un código nuevo", async () => {
    const { user, code } = await withPin("Ane");
    const token = await createSession(user.id);
    const fresh = await regenerateLoginCode(user.id);
    expect(fresh).not.toBe(code);
    expect((await userById(user.id)).pinHash).toBeNull();
    expect(await userFromSessionToken(token)).toBeNull();
    await expect(loginWithPin("ane", "2580")).rejects.toThrow(/código de invitación/);
    expect((await loginWithCode(fresh)).id).toBe(user.id);
  });

  it("el panel de la sala solo enseña el código de quien aún no tiene PIN", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [{ name: "Ane" }, { name: "Beñat" }]);
    await setAccess(people[0].userId, { pin: "2580", repeat: "2580" });
    const rows = await listParticipantsForAdmin(admin, game.id);
    expect(rows.find((r) => r.name === "Ane")).toMatchObject({ hasPin: true, code: null });
    expect(rows.find((r) => r.name === "Beñat")).toMatchObject({ hasPin: false, code: expect.stringMatching(/-/) });
  });
});

describe("eliminar personas (admin)", () => {
  it("borra cuenta, listas, fotos subidas, sesiones, avisos y mensajes; las salas pasan al admin", async () => {
    const admin = await makeAdmin();
    const victim = await makeUser("Beñat");
    const keeper = await makeUser("Ane");
    const owned = await createGame(victim, gameInput({ name: "Sala de Beñat" })).catch(() => null);
    const g = await createGame(admin, gameInput());
    await joinGame(victim, g.joinToken);
    await joinGame(keeper, g.joinToken);
    const photo = await saveUpload(PNG);
    const keeperPhoto = await saveUpload(PNG);
    await addWish(victim, g.id, { title: "Con foto", imageUrl: photo }, noPreview);
    await addWish(keeper, g.id, { title: "La de Ane", imageUrl: keeperPhoto }, noPreview);
    await createSession(victim.id);
    await saveSubscription(victim, { endpoint: "https://push.test/x", keys: { p256dh: "p", auth: "a" } });
    expect(onDisk(photo)).toBe(true);

    const r = await deleteUserByAdmin(admin, victim.id);
    expect(r.removedFiles).toBe(1);
    expect(onDisk(photo)).toBe(false);
    expect(onDisk(keeperPhoto)).toBe(true); // lo de los demás no se toca
    expect(await db.user.findUnique({ where: { id: victim.id } })).toBeNull();
    expect(await db.participant.count({ where: { userId: victim.id } })).toBe(0);
    expect(await db.wish.count({ where: { title: "Con foto" } })).toBe(0);
    expect(await db.session.count({ where: { userId: victim.id } })).toBe(0);
    expect(await db.pushSubscription.count()).toBe(0);
    expect(await db.wish.count({ where: { title: "La de Ane" } })).toBe(1);
    if (owned) expect((await db.game.findUniqueOrThrow({ where: { id: owned.id } })).ownerId).toBe(admin.id);
  });

  it("no borra una foto que siga usando otra edición", async () => {
    const admin = await makeAdmin();
    const u = await makeUser("Beñat");
    const g1 = await createGame(admin, gameInput({ name: "2025" }));
    const g2 = await createGame(admin, gameInput({ name: "2026" }));
    await joinGame(u, g1.joinToken);
    await joinGame(u, g2.joinToken);
    const photo = await saveUpload(PNG);
    const w = await addWish(u, g1.id, { title: "Foto", imageUrl: photo }, noPreview);
    await copyWishesFrom(u, g2.id, g1.id);
    await setWantsSurprise(u, g1.id, true);
    await deleteWish(u, w.id);
    expect(onDisk(photo)).toBe(true); // la sigue usando la copia de 2026
  });

  it("no se puede eliminar a uno mismo, a un admin, ni a alguien de una sala sorteada sin cerrar", async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin("Otro Admin");
    const { game, people } = await gameWith(admin, [{ name: "Ane" }, { name: "Beñat" }, { name: "Carla" }]);
    await expect(deleteUserByAdmin(admin, admin.id)).rejects.toThrow(/propia/);
    await expect(deleteUserByAdmin(admin, other.id)).rejects.toThrow(/admin/);
    const pepe = await makeUser("Pepe");
    await expect(deleteUserByAdmin(pepe, people[0].userId)).rejects.toThrow(/administrador/);
    await performDraw(admin, game.id);
    await expect(deleteUserByAdmin(admin, people[0].userId)).rejects.toThrow(/sorteada/);
    await db.game.update({ where: { id: game.id }, data: { status: "FINISHED" } });
    await deleteUserByAdmin(admin, people[0].userId);
  });
});

describe("«Lo que quieras, sorpréndeme» y lista vacía", () => {
  async function setup() {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [{ name: "Ane" }, { name: "Beñat" }, { name: "Carla" }]);
    const users = await Promise.all(people.map((p) => userById(p.userId)));
    return { admin, game, people, users };
  }

  it("empieza desmarcado y la lista vacía se detecta", async () => {
    const { game, users } = await setup();
    expect(await myListState(users[0], game.id)).toEqual({ wantsSurprise: false, wishCount: 0, empty: true });
    await setWantsSurprise(users[0], game.id, true);
    expect((await myListState(users[0], game.id))!.empty).toBe(false);
  });

  it("no deja quitar lo último: ni desmarcar sin ideas ni borrar la última idea sin la casilla", async () => {
    const { game, users } = await setup();
    await expect(setWantsSurprise(users[0], game.id, false)).rejects.toThrow(/no puede quedarse vacía/);
    const w = await addWish(users[0], game.id, { title: "Libro" }, noPreview);
    await expect(deleteWish(users[0], w.id)).rejects.toThrow(/no puede quedarse vacía/);
    await setWantsSurprise(users[0], game.id, true);
    await deleteWish(users[0], w.id);
    await expect(setWantsSurprise(users[0], game.id, false)).rejects.toThrow(/no puede quedarse vacía/);
  });

  it("se pueden tener ideas Y la casilla a la vez; quien regala ve la casilla solo si está marcada", async () => {
    const { admin, game, people, users } = await setup();
    await addWish(users[0], game.id, { title: "Libro" }, noPreview);
    await setWantsSurprise(users[0], game.id, true);
    await setWantsSurprise(users[0], game.id, false); // con ideas sí se puede desmarcar
    await setWantsSurprise(users[0], game.id, true);
    await performDraw(admin, game.id);
    const a = await db.assignment.findFirstOrThrow({ where: { receiverId: people[0].participantId }, include: { giver: true } });
    const giver = await userById(a.giver.userId);
    const { receivers } = await getMyReceivers(giver, game.id);
    expect(receivers[0]).toMatchObject({ wantsSurprise: true });
    expect(receivers[0].wishes).toHaveLength(1);
  });

  it("comprobar el sorteo avisa de quién tiene la lista vacía (sin bloquear)", async () => {
    const { admin, game, users } = await setup();
    await setWantsSurprise(users[0], game.id, true);
    await addWish(users[1], game.id, { title: "X" }, noPreview);
    const r = await checkDraw(admin, game.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const w = r.warnings.join(" ");
      expect(w).toContain("Carla");
      expect(w).not.toContain("Ane");
      expect(w).not.toContain("Beñat");
    }
  });

  it("copiar la lista del año pasado copia también la casilla", async () => {
    const admin = await makeAdmin();
    const u = await makeUser("Ane");
    const g1 = await createGame(admin, gameInput({ name: "2025" }));
    const g2 = await createGame(admin, gameInput({ name: "2026" }));
    await joinGame(u, g1.joinToken);
    await joinGame(u, g2.joinToken);
    await setWantsSurprise(u, g1.id, true);
    await copyWishesFrom(u, g2.id, g1.id);
    expect((await myListState(u, g2.id))!.wantsSurprise).toBe(true);
  });
});

