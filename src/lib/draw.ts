/**
 * Algoritmo del sorteo (puro, sin base de datos).
 *
 * Reglas duras: nadie se regala a sí mismo, se respetan las exclusiones
 * (bidireccionales) y los grupos según el modo.
 * Regla blanda: no repetir quién regaló a quién en la edición anterior. Si con
 * ella el sorteo es imposible, se relaja y se devuelve un aviso.
 *
 * Se prefiere un único gran círculo (A→B→C→…→A) para que nadie se regale
 * "en parejas"; si no es posible, cualquier permutación válida.
 */
import { randomInt } from "node:crypto";

export type DrawGroupMode = "NONE" | "SEPARATE" | "KIDS_FROM_ADULTS";
export type DrawAgeGroup = "ADULT" | "CHILD";

export interface DrawParticipant {
  id: string;
  userId: string;
  name: string;
  group: DrawAgeGroup;
}

export interface DrawInput {
  participants: DrawParticipant[];
  mode: DrawGroupMode;
  /** Pares de participantes que no pueden regalarse entre sí (en ningún sentido). */
  exclusions: Array<[string, string]>;
  /** Pares giverUserId→receiverUserId de la edición anterior (a evitar). */
  previousPairs?: Array<[string, string]>;
  /** Inyectable para tests deterministas. Devuelve entero en [0, max). */
  random?: (max: number) => number;
}

export interface DrawPair {
  giverId: string;
  receiverId: string;
}

export interface DrawResult {
  pairs: DrawPair[];
  warnings: string[];
}

export class DrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawError";
  }
}

type Forbidden = (giver: string, receiver: string) => boolean;

const MAX_STEPS = 200_000;

function shuffle<T>(arr: T[], rnd: (max: number) => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Busca un ciclo hamiltoniano aleatorio que respete las restricciones. */
function findSingleCycle(ids: string[], forbidden: Forbidden, rnd: (max: number) => number): DrawPair[] | null {
  const order = shuffle(ids, rnd);
  const start = order[0];
  const path = [start];
  const used = new Set([start]);
  let steps = 0;

  const dfs = (): boolean => {
    if (++steps > MAX_STEPS) return false;
    const last = path[path.length - 1];
    if (path.length === ids.length) return !forbidden(last, start);
    for (const next of shuffle(order.filter((id) => !used.has(id)), rnd)) {
      if (forbidden(last, next)) continue;
      path.push(next);
      used.add(next);
      if (dfs()) return true;
      path.pop();
      used.delete(next);
    }
    return false;
  };

  if (!dfs()) return null;
  return path.map((giverId, i) => ({ giverId, receiverId: path[(i + 1) % path.length] }));
}

/** Cualquier permutación sin puntos fijos que respete las restricciones. */
function findAnyDerangement(ids: string[], forbidden: Forbidden, rnd: (max: number) => number): DrawPair[] | null {
  // Ordenar givers por número de opciones (los más restringidos primero)
  const options = new Map(ids.map((g) => [g, ids.filter((r) => r !== g && !forbidden(g, r))]));
  const givers = shuffle(ids, rnd).sort((a, b) => options.get(a)!.length - options.get(b)!.length);
  const taken = new Set<string>();
  const result = new Map<string, string>();
  let steps = 0;

  const dfs = (i: number): boolean => {
    if (++steps > MAX_STEPS) return false;
    if (i === givers.length) return true;
    const g = givers[i];
    for (const r of shuffle(options.get(g)!, rnd)) {
      if (taken.has(r)) continue;
      taken.add(r);
      result.set(g, r);
      if (dfs(i + 1)) return true;
      taken.delete(r);
      result.delete(g);
    }
    return false;
  };

  if (!dfs(0)) return null;
  return ids.map((giverId) => ({ giverId, receiverId: result.get(giverId)! }));
}

function drawPool(ids: string[], forbidden: Forbidden, rnd: (max: number) => number): DrawPair[] | null {
  return findSingleCycle(ids, forbidden, rnd) ?? findAnyDerangement(ids, forbidden, rnd);
}

/** Reparte niños entre adultos de forma equilibrada. */
function assignKids(
  kids: string[],
  adults: string[],
  forbidden: Forbidden,
  rnd: (max: number) => number,
): DrawPair[] | null {
  const load = new Map(adults.map((a) => [a, 0]));
  const pairs: DrawPair[] = [];
  // Primero los niños con menos adultos posibles
  const ordered = shuffle(kids, rnd).sort(
    (a, b) => adults.filter((x) => !forbidden(x, a)).length - adults.filter((x) => !forbidden(x, b)).length,
  );
  for (const kid of ordered) {
    const allowed = adults.filter((a) => !forbidden(a, kid));
    if (allowed.length === 0) return null;
    const minLoad = Math.min(...allowed.map((a) => load.get(a)!));
    const best = allowed.filter((a) => load.get(a) === minLoad);
    const giver = best[rnd(best.length)];
    load.set(giver, load.get(giver)! + 1);
    pairs.push({ giverId: giver, receiverId: kid });
  }
  return pairs;
}

export function runDraw(input: DrawInput): DrawResult {
  const rnd = input.random ?? ((max: number) => randomInt(max));
  const { participants, mode } = input;
  const byId = new Map(participants.map((p) => [p.id, p]));

  if (new Set(participants.map((p) => p.id)).size !== participants.length) {
    throw new DrawError("Hay participantes duplicados.");
  }

  const excl = new Set<string>();
  for (const [a, b] of input.exclusions) {
    excl.add(`${a}|${b}`);
    excl.add(`${b}|${a}`);
  }
  const prev = new Set((input.previousPairs ?? []).map(([g, r]) => `${g}|${r}`));

  const hard: Forbidden = (g, r) => g === r || excl.has(`${g}|${r}`);
  const withSoft: Forbidden = (g, r) =>
    hard(g, r) || prev.has(`${byId.get(g)!.userId}|${byId.get(r)!.userId}`);

  const warnings: string[] = [];
  const pools: Array<{ label: string; ids: string[] }> = [];
  const adults = participants.filter((p) => p.group === "ADULT").map((p) => p.id);
  const kids = participants.filter((p) => p.group === "CHILD").map((p) => p.id);

  if (participants.length < 3) {
    throw new DrawError("Hacen falta al menos 3 participantes para que el sorteo tenga gracia.");
  }

  if (mode === "NONE") {
    pools.push({ label: "todos", ids: participants.map((p) => p.id) });
  } else if (mode === "SEPARATE") {
    if (adults.length === 1) throw new DrawError("Solo hay 1 adulto: el grupo de adultos necesita al menos 2 personas.");
    if (kids.length === 1) throw new DrawError("Solo hay 1 niño: el grupo de niños necesita al menos 2 personas (o pásalo al grupo de adultos).");
    if (adults.length) pools.push({ label: "adultos", ids: adults });
    if (kids.length) pools.push({ label: "niños", ids: kids });
  } else {
    if (adults.length < 2) throw new DrawError("En el modo «los adultos regalan a los niños» hacen falta al menos 2 adultos.");
    pools.push({ label: "adultos", ids: adults });
  }

  const pairs: DrawPair[] = [];
  let relaxed = false;

  for (const pool of pools) {
    let result = prev.size ? drawPool(pool.ids, withSoft, rnd) : null;
    if (!result) {
      result = drawPool(pool.ids, hard, rnd);
      if (result && prev.size) relaxed = true;
    }
    if (!result) {
      throw new DrawError(
        `No hay forma de hacer el sorteo del grupo de ${pool.label} con las exclusiones actuales. Quita alguna exclusión e inténtalo de nuevo.`,
      );
    }
    pairs.push(...result);
  }

  if (mode === "KIDS_FROM_ADULTS" && kids.length) {
    let kidPairs = prev.size ? assignKids(kids, adults, withSoft, rnd) : null;
    if (!kidPairs) {
      kidPairs = assignKids(kids, adults, hard, rnd);
      if (kidPairs && prev.size) relaxed = true;
    }
    if (!kidPairs) {
      throw new DrawError("Algún niño no tiene ningún adulto posible que le regale (revisa las exclusiones).");
    }
    pairs.push(...kidPairs);
  }

  if (relaxed) {
    warnings.push("No se ha podido evitar repetir alguna pareja del año pasado; el resto de reglas se cumplen.");
  }

  return { pairs, warnings };
}

/** Comprueba un resultado (útil en tests y como red de seguridad antes de guardar). */
export function validateDraw(input: DrawInput, pairs: DrawPair[]): string[] {
  const problems: string[] = [];
  const byId = new Map(input.participants.map((p) => [p.id, p]));
  const excl = new Set(input.exclusions.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const receivers = new Map<string, number>();

  for (const { giverId, receiverId } of pairs) {
    const g = byId.get(giverId);
    const r = byId.get(receiverId);
    if (!g || !r) { problems.push("participante desconocido"); continue; }
    if (giverId === receiverId) problems.push(`${g.name} se regala a sí mismo`);
    if (excl.has(`${giverId}|${receiverId}`)) problems.push(`${g.name} → ${r.name} está excluido`);
    if (input.mode === "SEPARATE" && g.group !== r.group) problems.push(`${g.name} → ${r.name} mezcla grupos`);
    if (input.mode === "KIDS_FROM_ADULTS" && g.group === "CHILD") problems.push(`${g.name} es niño y no debería regalar`);
    receivers.set(receiverId, (receivers.get(receiverId) ?? 0) + 1);
  }
  for (const p of input.participants) {
    const n = receivers.get(p.id) ?? 0;
    if (n !== 1) problems.push(`${p.name} recibe ${n} regalos`);
  }
  if (input.mode !== "KIDS_FROM_ADULTS") {
    const givers = new Map<string, number>();
    for (const { giverId } of pairs) givers.set(giverId, (givers.get(giverId) ?? 0) + 1);
    for (const p of input.participants) {
      if ((givers.get(p.id) ?? 0) !== 1) problems.push(`${p.name} regala ${givers.get(p.id) ?? 0} veces`);
    }
  }
  return problems;
}
