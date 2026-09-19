/**
 * Contrat du moteur de course, vérifié sur le stub. Le moteur planck devra passer les
 * mêmes tests : déterminisme, 50 arrivants, écart premier–dernier sous ~20 s.
 */
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { ReplayReader, base64ToInt16, int16ToBase64 } from "@/shared/replay";
import type { RacerEntry } from "@/shared/types";
import { getEngine } from "@/sim";
import { forkRng, mulberry32, seedToU32 } from "@/sim/prng";

const racers: RacerEntry[] = Array.from({ length: 50 }, (_, id) => ({
  id,
  name: `R${id}`,
  isBot: id > 2,
  address: null,
  color: "#fff",
  joinTx: null,
}));
const seed = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const engine = getEngine("stub");

describe("PRNG", () => {
  it("mulberry32 est déterministe et reste dans [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it("replie un seed de 32 octets et sépare les flux nommés", () => {
    expect(seedToU32(seed(0xabc))).toBe(seedToU32(seed(0xabc)));
    expect(seedToU32(seed(1))).not.toBe(seedToU32(seed(2)));
    expect(forkRng(seed(1), "a")()).not.toBe(forkRng(seed(1), "b")());
  });
});

describe("codec du replay", () => {
  it("fait l'aller-retour Int16 ↔ base64, valeurs négatives comprises", () => {
    const v = new Int16Array([0, 1, -1, 32767, -32768, 1234]);
    expect(Array.from(base64ToInt16(int16ToBase64(v)))).toEqual(Array.from(v));
  });
});

describe("moteur stub", () => {
  it("est déterministe : deux fois le même seed = même résultat, octet pour octet", () => {
    expect(engine.simulate({ seed: seed(0xabc), racers })).toEqual(engine.simulate({ seed: seed(0xabc), racers }));
  });

  it("change de classement avec le seed", () => {
    const a = engine.simulate({ seed: seed(1), racers }).ranking.map((e) => e.racerId);
    const b = engine.simulate({ seed: seed(2), racers }).ranking.map((e) => e.racerId);
    expect(a).not.toEqual(b);
  });

  // « Sanity de la course » du plan : 5 seeds, personne ne reste coincé, écart < 20 s.
  for (const n of [11, 22, 33, 44, 55]) {
    it(`seed ${n} : 50 arrivants, rangs 1..50, course de 60 à 90 s, écart < 20 s`, () => {
      const r = engine.simulate({ seed: seed(n), racers });
      expect(r.ranking).toHaveLength(50);
      expect(r.ranking.map((e) => e.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(new Set(r.ranking.map((e) => e.racerId)).size).toBe(50);
      const first = r.ranking[0].finishMs;
      const last = r.ranking[49].finishMs;
      expect(first).toBeGreaterThanOrEqual(60_000);
      expect(last).toBeLessThanOrEqual(90_000);
      expect(last - first).toBeLessThan(20_000);
      expect(r.durationMs).toBe(last);
      for (let i = 1; i < 50; i++) expect(r.ranking[i].finishMs).toBeGreaterThanOrEqual(r.ranking[i - 1].finishMs);
    });
  }

  it("produit un replay cohérent avec le classement", () => {
    const r = engine.simulate({ seed: seed(7), racers });
    const reader = new ReplayReader(r.replay);
    expect(reader.replay.racers).toBe(50);
    expect(reader.durationMs).toBeGreaterThanOrEqual(r.durationMs);
    for (const e of r.ranking) {
      expect(reader.value(e.racerId, 0, 0)).toBe(0);
      expect(reader.value(e.racerId, 0, e.finishMs - 500)).toBeLessThan(1);
      expect(reader.value(e.racerId, 0, e.finishMs + 100)).toBe(1);
    }
    // Taille : doit rester une réponse HTTP légère.
    expect(r.replay.data.length).toBeLessThan(300_000);
  });
});
