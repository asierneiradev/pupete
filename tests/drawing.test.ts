import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveSubscription, setPushSender } from "@/lib/push";
import { validateDraw } from "@/lib/draw";
import { createNextEdition } from "@/lib/services/games";
import { addExclusion, addParticipantByAdmin } from "@/lib/services/participants";
import { checkDraw, gameProgress, getMyReceivers, markRevealed, performDraw, resetDraw } from "@/lib/services/drawing";
import { addWish } from "@/lib/services/wishes";
import { updateProfile } from "@/lib/services/auth";
import { gameWith, makeAdmin, makeUser, noPreview, userById } from "./helpers";

const FIVE = [{ name: "Ane" }, { name: "Beñat" }, { name: "Carla" }, { name: "Dani" }, { name: "Eneko" }];

describe("comprobar antes de sortear", () => {
  it("avisa si faltan personas o si los grupos no cuadran, sin guardar nada", async () => {
    const admin = await makeAdmin();
    const small = await gameWith(admin, [{ name: "A" }, { name: "B" }]);
    expect(await checkDraw(admin, small.game.id)).toMatchObject({ ok: false, error: expect.stringMatching(/al menos 3/) });
    const kids = await gameWith(admin, [...FIVE, { name: "Kiko", group: "CHILD" }], { groupMode: "SEPARATE" });
    expect(await checkDraw(admin, kids.game.id)).toMatchObject({ ok: false, error: expect.stringMatching(/1 niño/) });
    const ok = await gameWith(admin, FIVE);
    // Todos con la lista vacía: se puede sortear, pero avisa
    expect(await checkDraw(admin, ok.game.id)).toMatchObject({ ok: true, warnings: [expect.stringMatching(/lista vacía/)] });
    await db.participant.updateMany({ where: { gameId: ok.game.id }, data: { wantsSurprise: true } });
    expect(await checkDraw(admin, ok.game.id)).toEqual({ ok: true, warnings: [] });
    expect(await db.assignment.count()).toBe(0);
  });

  it("solo el admin puede comprobar o sortear", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const { game } = await gameWith(admin, FIVE);
    await expect(checkDraw(u, game.id)).rejects.toThrow(/permiso/);
    await expect(performDraw(u, game.id)).rejects.toThrow(/permiso/);
  });
});

describe("sorteo", () => {
  it("asigna a todos, cierra la inscripción, avisa por push y no se puede repetir", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, FIVE);
    const sent: Array<{ endpoint: string; payload: string }> = [];
    setPushSender(async (t, payload) => {
      sent.push({ endpoint: t.endpoint, payload });
      return 201;
    });
    await saveSubscription(await userById(people[0].userId), { endpoint: "https://push.test/ane", keys: { p256dh: "p", auth: "a" } });
    const r = await performDraw(admin, game.id).finally(() => setPushSender(null));
    expect(r.pairs).toHaveLength(5);
    const g = await db.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(g.status).toBe("DRAWN");
    expect(g.joinOpen).toBe(false);
    expect(g.drawnAt).toBeTruthy();
    expect(await db.assignment.count({ where: { gameId: game.id } })).toBe(5);
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe("https://push.test/ane");
    // El aviso no revela a quién te ha tocado
    for (const p of FIVE) expect(sent[0].payload).not.toContain(p.name);
    await expect(performDraw(admin, game.id)).rejects.toThrow(/ya está hecho/);
  });

  it("dos clics simultáneos solo producen un sorteo", async () => {
    const admin = await makeAdmin();
    const { game } = await gameWith(admin, FIVE);
    const results = await Promise.allSettled([performDraw(admin, game.id), performDraw(admin, game.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.assignment.count({ where: { gameId: game.id } })).toBe(5);
  });

  it("respeta exclusiones y grupos separados guardados en BD", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [
      { name: "A1" }, { name: "A2" }, { name: "A3" }, { name: "A4" },
      { name: "K1", group: "CHILD" }, { name: "K2", group: "CHILD" }, { name: "K3", group: "CHILD" },
    ], { groupMode: "SEPARATE" });
    await addExclusion(admin, game.id, people[0].participantId, people[1].participantId);
    await performDraw(admin, game.id);
    const assignments = await db.assignment.findMany({ where: { gameId: game.id } });
    const parts = await db.participant.findMany({ where: { gameId: game.id }, include: { user: true } });
    const problems = validateDraw(
      {
        participants: parts.map((p) => ({ id: p.id, userId: p.userId, name: p.user.name, group: p.group })),
        mode: "SEPARATE",
        exclusions: [[people[0].participantId, people[1].participantId]],
      },
      assignments,
    );
    expect(problems).toEqual([]);
  });

  it("modo niños: los adultos regalan también a los niños", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [
      { name: "A1" }, { name: "A2" }, { name: "A3" }, { name: "K1", group: "CHILD" }, { name: "K2", group: "CHILD" },
    ], { groupMode: "KIDS_FROM_ADULTS" });
    await performDraw(admin, game.id);
    const kidUser = await userById(people[3].userId);
    expect((await getMyReceivers(kidUser, game.id)).receivers).toHaveLength(0);
    let total = 0;
    for (const p of people.slice(0, 3)) {
      total += (await getMyReceivers(await userById(p.userId), game.id)).receivers.length;
    }
    expect(total).toBe(5);
  });

  it("deshacer el sorteo borra asignaciones, compras y revelaciones", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, FIVE);
    const u = await userById(people[0].userId);
    const w = await addWish(u, game.id, { title: "X" }, noPreview);
    await performDraw(admin, game.id);
    await markRevealed(u, game.id);
    await db.wish.update({ where: { id: w.id }, data: { purchased: true } });
    await resetDraw(admin, game.id);
    expect(await db.assignment.count()).toBe(0);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).purchased).toBe(false);
    expect((await db.participant.findUniqueOrThrow({ where: { id: people[0].participantId } })).revealedAt).toBeNull();
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe("OPEN");
    await expect(resetDraw(admin, game.id)).rejects.toThrow(/Solo se puede deshacer/);
    // y se puede volver a sortear
    await addParticipantByAdmin(admin, game.id, { name: "Fede" });
    expect((await performDraw(admin, game.id)).pairs).toHaveLength(6);
  });
});

describe("después del sorteo: mi asignación", () => {
  it("cada uno ve a quién regala con su lista (incluye compras) y su ficha", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, FIVE, { budgetMax: 3000 });
    const users = await Promise.all(people.map((p) => userById(p.userId)));
    for (const u of users) {
      await updateProfile(u.id, { name: u.name, shoeSize: "40", likes: `cosas de ${u.name}` });
      await addWish(u, game.id, { title: `Regalo para ${u.name}`, links: ["https://a.com"] }, noPreview);
    }
    await performDraw(admin, game.id);
    const seen = new Set<string>();
    for (const u of users) {
      const { receivers } = await getMyReceivers(u, game.id);
      expect(receivers).toHaveLength(1);
      const r = receivers[0];
      expect(r.name).not.toBe(u.name);
      expect(r.wishes[0].title).toBe(`Regalo para ${r.name}`);
      expect(r.wishes[0].links).toHaveLength(1);
      expect("purchased" in r.wishes[0]).toBe(true);
      expect(r.profile.likes).toBe(`cosas de ${r.name}`);
      expect(r.profile.shoeSize).toBe("40");
      seen.add(r.participantId);
    }
    expect(seen.size).toBe(5);
  });

  it("quien no participa no puede consultar", async () => {
    const admin = await makeAdmin();
    const { game } = await gameWith(admin, FIVE);
    await performDraw(admin, game.id);
    await expect(getMyReceivers(await makeUser("Cotilla"), game.id)).rejects.toThrow(/No participas/);
  });

  it("progreso para el admin sin revelar nada", async () => {
    const admin = await makeAdmin();
    const { game, people } = await gameWith(admin, [...FIVE, { name: "K1", group: "CHILD" }]);
    const u = await userById(people[0].userId);
    await addWish(u, game.id, { title: "X" }, noPreview);
    await performDraw(admin, game.id);
    await markRevealed(u, game.id);
    await markRevealed(u, game.id);
    expect(await gameProgress(game.id)).toEqual({ total: 6, adults: 5, kids: 1, withWishes: 1, revealed: 1 });
  });
});

describe("no repetir el año anterior (de punta a punta)", () => {
  it("la nueva edición evita las parejas de la anterior", async () => {
    const admin = await makeAdmin();
    const { game } = await gameWith(admin, [...FIVE, { name: "Fede" }]);
    await performDraw(admin, game.id);
    const prev = await db.assignment.findMany({ where: { gameId: game.id }, include: { giver: true, receiver: true } });
    const prevPairs = new Set(prev.map((a) => `${a.giver.userId}>${a.receiver.userId}`));
    for (let i = 0; i < 5; i++) {
      const next = await createNextEdition(admin, game.id, `2027-${i}`);
      const r = await performDraw(admin, next.id);
      expect(r.warnings).toEqual([]);
      const now = await db.assignment.findMany({ where: { gameId: next.id }, include: { giver: true, receiver: true } });
      for (const a of now) expect(prevPairs.has(`${a.giver.userId}>${a.receiver.userId}`)).toBe(false);
    }
  });
});
