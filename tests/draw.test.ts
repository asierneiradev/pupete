import { describe, expect, it } from "vitest";
import { DrawError, runDraw, validateDraw, type DrawInput, type DrawParticipant } from "@/lib/draw";

const people = (n: number, group: "ADULT" | "CHILD" = "ADULT", prefix = "p"): DrawParticipant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, userId: `u-${prefix}${i}`, name: `${prefix}${i}`, group }));

function check(input: DrawInput, times = 200) {
  for (let i = 0; i < times; i++) {
    const r = runDraw(input);
    expect(validateDraw(input, r.pairs)).toEqual([]);
  }
}

function isSingleCycle(pairs: Array<{ giverId: string; receiverId: string }>) {
  const next = new Map(pairs.map((p) => [p.giverId, p.receiverId]));
  const start = pairs[0].giverId;
  let cur = next.get(start)!;
  let steps = 1;
  while (cur !== start && steps <= pairs.length) {
    cur = next.get(cur)!;
    steps++;
  }
  return steps === pairs.length;
}

describe("runDraw · todos juntos", () => {
  it("nadie se regala a sí mismo y cada uno da y recibe exactamente una vez", () => {
    check({ participants: people(7), mode: "NONE", exclusions: [] });
  });

  it("prefiere un único círculo (sin parejas cerradas)", () => {
    for (let i = 0; i < 50; i++) {
      const r = runDraw({ participants: people(8), mode: "NONE", exclusions: [] });
      expect(isSingleCycle(r.pairs)).toBe(true);
    }
  });

  it("con 3 personas funciona y es un círculo", () => {
    const r = runDraw({ participants: people(3), mode: "NONE", exclusions: [] });
    expect(r.pairs).toHaveLength(3);
    expect(isSingleCycle(r.pairs)).toBe(true);
  });

  it("rechaza menos de 3 participantes", () => {
    expect(() => runDraw({ participants: people(2), mode: "NONE", exclusions: [] })).toThrow(DrawError);
  });

  it("rechaza participantes duplicados", () => {
    const p = people(3);
    expect(() => runDraw({ participants: [...p, p[0]], mode: "NONE", exclusions: [] })).toThrow(/duplicados/);
  });

  it("es aleatorio (no siempre sale lo mismo)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = runDraw({ participants: people(6), mode: "NONE", exclusions: [] });
      seen.add(r.pairs.map((p) => `${p.giverId}>${p.receiverId}`).sort().join(","));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it("funciona con grupos grandes (100 personas)", () => {
    check({ participants: people(100), mode: "NONE", exclusions: [] }, 5);
  });
});

describe("runDraw · exclusiones", () => {
  it("las exclusiones se respetan en ambos sentidos", () => {
    const p = people(6);
    const input: DrawInput = { participants: p, mode: "NONE", exclusions: [["p0", "p1"], ["p2", "p3"], ["p4", "p5"]] };
    for (let i = 0; i < 200; i++) {
      const r = runDraw(input);
      for (const pair of r.pairs) {
        const k = [pair.giverId, pair.receiverId].sort().join("|");
        expect(["p0|p1", "p2|p3", "p4|p5"]).not.toContain(k);
      }
    }
  });

  it("da un error claro si las exclusiones lo hacen imposible", () => {
    const p = people(3);
    expect(() => runDraw({ participants: p, mode: "NONE", exclusions: [["p0", "p1"]] })).toThrow(/exclusiones/);
  });

  it("cae a una permutación no circular si el círculo es imposible pero hay solución", () => {
    // 4 personas: p0 solo puede regalar a p1 y p1 solo a p0 → dos parejas
    const p = people(4);
    const input: DrawInput = {
      participants: p,
      mode: "NONE",
      exclusions: [["p0", "p2"], ["p0", "p3"], ["p1", "p2"], ["p1", "p3"]],
    };
    const r = runDraw(input);
    expect(validateDraw(input, r.pairs)).toEqual([]);
    expect(isSingleCycle(r.pairs)).toBe(false);
  });
});

describe("runDraw · adultos y niños separados", () => {
  const input: DrawInput = {
    participants: [...people(5, "ADULT", "a"), ...people(4, "CHILD", "k")],
    mode: "SEPARATE",
    exclusions: [],
  };

  it("adultos regalan a adultos y niños a niños", () => {
    check(input);
  });

  it("error si solo hay un niño", () => {
    expect(() =>
      runDraw({ participants: [...people(4, "ADULT", "a"), ...people(1, "CHILD", "k")], mode: "SEPARATE", exclusions: [] }),
    ).toThrow(/Solo hay 1 niño/);
  });

  it("error si solo hay un adulto", () => {
    expect(() =>
      runDraw({ participants: [...people(1, "ADULT", "a"), ...people(3, "CHILD", "k")], mode: "SEPARATE", exclusions: [] }),
    ).toThrow(/Solo hay 1 adulto/);
  });

  it("funciona si solo hay adultos", () => {
    check({ participants: people(4, "ADULT"), mode: "SEPARATE", exclusions: [] }, 20);
  });
});

describe("runDraw · los adultos regalan a los niños", () => {
  const adults = people(4, "ADULT", "a");
  const kids = people(3, "CHILD", "k");

  it("los niños no regalan, cada uno recibe de un adulto y los adultos se regalan entre sí", () => {
    const input: DrawInput = { participants: [...adults, ...kids], mode: "KIDS_FROM_ADULTS", exclusions: [] };
    for (let i = 0; i < 200; i++) {
      const r = runDraw(input);
      expect(validateDraw(input, r.pairs)).toEqual([]);
      expect(r.pairs.filter((p) => p.giverId.startsWith("k"))).toHaveLength(0);
      expect(r.pairs).toHaveLength(7);
    }
  });

  it("reparte a los niños de forma equilibrada", () => {
    const input: DrawInput = {
      participants: [...people(3, "ADULT", "a"), ...people(6, "CHILD", "k")],
      mode: "KIDS_FROM_ADULTS",
      exclusions: [],
    };
    const r = runDraw(input);
    const kidLoad = new Map<string, number>();
    for (const p of r.pairs.filter((x) => x.receiverId.startsWith("k"))) {
      kidLoad.set(p.giverId, (kidLoad.get(p.giverId) ?? 0) + 1);
    }
    expect([...kidLoad.values()].every((n) => n === 2)).toBe(true);
  });

  it("respeta exclusiones adulto-niño (p. ej. padres)", () => {
    const input: DrawInput = {
      participants: [...adults, ...kids],
      mode: "KIDS_FROM_ADULTS",
      exclusions: [["a0", "k0"], ["a1", "k0"], ["a2", "k0"]],
    };
    for (let i = 0; i < 100; i++) {
      const r = runDraw(input);
      expect(r.pairs.find((p) => p.receiverId === "k0")!.giverId).toBe("a3");
    }
  });

  it("error si un niño no tiene ningún adulto posible", () => {
    const input: DrawInput = {
      participants: [...people(2, "ADULT", "a"), ...people(1, "CHILD", "k")],
      mode: "KIDS_FROM_ADULTS",
      exclusions: [["a0", "k0"], ["a1", "k0"]],
    };
    expect(() => runDraw(input)).toThrow(/ningún adulto/);
  });

  it("necesita al menos 2 adultos", () => {
    expect(() =>
      runDraw({ participants: [...people(1, "ADULT", "a"), ...people(3, "CHILD", "k")], mode: "KIDS_FROM_ADULTS", exclusions: [] }),
    ).toThrow(/2 adultos/);
  });
});

describe("runDraw · no repetir el año anterior", () => {
  it("evita las parejas del año pasado cuando es posible", () => {
    const p = people(6);
    const previousPairs: Array<[string, string]> = p.map((x, i) => [x.userId, p[(i + 1) % p.length].userId]);
    for (let i = 0; i < 100; i++) {
      const r = runDraw({ participants: p, mode: "NONE", exclusions: [], previousPairs });
      expect(r.warnings).toEqual([]);
      for (const pair of r.pairs) {
        const g = p.find((x) => x.id === pair.giverId)!;
        const rc = p.find((x) => x.id === pair.receiverId)!;
        expect(previousPairs.some(([a, b]) => a === g.userId && b === rc.userId)).toBe(false);
      }
    }
  });

  it("si es imposible evitarlo, lo relaja y avisa", () => {
    // Con 3 personas solo hay 2 círculos; prohibimos ambos sentidos de uno y parte del otro
    const p = people(3);
    const previousPairs: Array<[string, string]> = [
      ["u-p0", "u-p1"], ["u-p1", "u-p2"], ["u-p2", "u-p0"],
      ["u-p0", "u-p2"],
    ];
    const r = runDraw({ participants: p, mode: "NONE", exclusions: [], previousPairs });
    expect(validateDraw({ participants: p, mode: "NONE", exclusions: [] }, r.pairs)).toEqual([]);
    expect(r.warnings[0]).toMatch(/año pasado/);
  });
});

describe("validateDraw", () => {
  it("detecta autoregalos, exclusiones y recuentos erróneos", () => {
    const p = people(3);
    const input: DrawInput = { participants: p, mode: "NONE", exclusions: [["p0", "p1"]] };
    const problems = validateDraw(input, [
      { giverId: "p0", receiverId: "p1" },
      { giverId: "p1", receiverId: "p1" },
    ]);
    expect(problems.join(" ")).toMatch(/excluido/);
    expect(problems.join(" ")).toMatch(/sí mismo/);
    expect(problems.join(" ")).toMatch(/p2 recibe 0/);
  });
});
