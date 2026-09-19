import { describe, expect, it } from "vitest";
import { planckEngine } from "@/sim/engine";
import { ReplayReader } from "@/shared/replay";
import type { RacerEntry } from "@/shared/types";
import { FINISH_Y, HEAD_RADIUS, PEGS, STAGES, TRACK_VERSION } from "@/sim/track";
import { finishTimes, physicalSeconds, position, standings } from "@/game/replay";
import { Lobby } from "@/server/rooms";
import { stubEngine } from "@/sim/stubEngine";

const racers: RacerEntry[] = Array.from({ length: 40 }, (_, id) => ({ id, name: `R${id}`, isBot: true, address: null, color: "#aaa", joinTx: null }));

describe("circuit physique Cascade", () => {
  it("les autres participants ne changent jamais la trajectoire physique du joueur", () => {
    const a = planckEngine.simulate({ seed: "0xcaca", racers });
    // Même place de départ pour le joueur 0 ; tous les autres ont un élan différent.
    const b = planckEngine.simulate({ seed: "0xcaca", racers: racers.map((r, i) => i === 0 ? r : { ...r, id: r.id + 1000 }) });
    const readers = [a, b].map((r) => new ReplayReader(r.replay));
    const atPhysical = (reader: ReplayReader, seconds: number) => {
      const c = reader.replay.clock!;
      const launch = c.launchWindow!;
      const replaySeconds = seconds <= launch ? seconds : seconds <= c.firstPhysical ? launch + (seconds - launch) * c.headScale : c.firstReplay! + (seconds - c.firstPhysical) * c.tailScale;
      return position(reader, 0, replaySeconds * 1000);
    };
    for (let t = 0; t < Math.min(a.replay.clock!.firstPhysical, b.replay.clock!.firstPhysical); t += 0.5) {
      const pa = atPhysical(readers[0], t), pb = atPhysical(readers[1], t);
      // Quantification et double interpolation à 30 Hz, sans contact entre corps.
      expect(Math.hypot(pa[0] - pb[0], pa[1] - pb[1])).toBeLessThan(0.08);
    }
  });
  it("émet exactement dix participants par seconde et les garde immobiles avant leur salve", () => {
    const r = planckEngine.simulate({ seed: "0xcaca", racers });
    const reader = new ReplayReader(r.replay);
    const releases = r.replay.releaseTimes!;
    expect(releases).toHaveLength(40);
    for (const ms of [0, 1000, 2000, 3000]) expect(releases.filter((t) => t === ms)).toHaveLength(10);
    for (let i = 0; i < racers.length; i++) {
      const start = position(reader, i, 0);
      if (releases[i] > 0) expect(position(reader, i, releases[i] - 40)).toEqual(start);
      expect(position(reader, i, releases[i] + 200)[1]).toBeGreaterThan(start[1] + 0.5);
    }
    for (const ms of [0, 500, 1000, 2000, 3000, 4000]) expect(physicalSeconds(reader, ms)).toBeCloseTo(ms / 1000, 8);
  });
  it("plafonne aussi le lobby à quarante participants", () => {
    const lobby = new Lobby({ engine: planckEngine, raceSize: 50, lobbyMs: 1000, prestartMs: 6000, randomSeed: () => "0xabc" });
    const race = lobby.hostStart();
    expect(lobby.race(race.raceId)!.racers).toHaveLength(40);
  });
  it("branche le moteur 3D sur les prochains départs sans modifier une course déjà lancée", () => {
    let now = 1_800_000_000_000;
    const lobby = new Lobby({ engine: stubEngine, raceSize: 40, lobbyMs: 1000, prestartMs: 6000, now: () => now, randomSeed: () => "0xabc" });
    const first = lobby.hostStart().raceId;
    const previousReplay = lobby.race(first)!.replay!.data;
    lobby.setEngine(planckEngine);
    now += 100;
    const second = lobby.hostStart().raceId;
    const race = lobby.race(second)!;
    expect(race.engine).toBe("planck");
    expect(race.replay?.channels).toBe(2);
    expect(lobby.race(first)!.replay!.data).toBe(previousReplay);
    now = race.finishAt!;
    lobby.tick();
    expect(lobby.race(second)!.ranking).toHaveLength(40);
    expect(lobby.lobby().recent[0].raceId).toBe(second);
  });
  it("rejoue exactement les mêmes collisions et arrivées avec la même graine", () => {
    const a = planckEngine.simulate({ seed: "0xabc", racers });
    const b = planckEngine.simulate({ seed: "0xabc", racers });
    expect(a).toEqual(b);
    expect(a.replay.track).toBe(TRACK_VERSION);
    expect(a.replay.channels).toBe(2);
    expect(a.replay.hz).toBe(30);
  });

  for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
    it(`graine ${seed} : 40 arrivants, toutes les épreuves, aucune sortie de piste`, () => {
      const r = planckEngine.simulate({ seed: `0x${seed.toString(16)}`, racers });
      const reader = new ReplayReader(r.replay);
      expect(r.ranking).toHaveLength(40);
      expect(new Set(r.ranking.map((x) => x.racerId)).size).toBe(40);
      expect(r.ranking[0].finishMs).toBe(40_000);
      expect(r.durationMs).toBeLessThanOrEqual(52_000);
      expect(r.ranking[39].finishMs - r.ranking[0].finishMs).toBeLessThan(20_000);
      expect(r.replay.data.length).toBeLessThan(700_000);
      const finishes = finishTimes(reader);
      expect(standings(reader, r.durationMs + 100, finishes).map((v) => v.index)).toEqual(r.ranking.map((v) => v.racerId));
      for (let i = 0; i < 40; i++) {
        expect(position(reader, i, r.durationMs + 100)[1]).toBeCloseTo(FINISH_Y, 2);
        const visited = new Set<number>();
        for (let f = 0; f < reader.replay.frames; f += 3) {
          const [x, y] = position(reader, i, f / 30 * 1000);
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(Math.abs(x)).toBeLessThan(11.1);
          STAGES.forEach((s, k) => { if (y >= s.from && y < s.to) visited.add(k); });
        }
        expect(visited.size).toBe(STAGES.length);
      }
    });
  }

  it("les trajectoires contournent les picots physiques, y compris entre les frames", () => {
    const r = planckEngine.simulate({ seed: "0x12345678", racers });
    const reader = new ReplayReader(r.replay);
    let nearPins = 0;
    for (let ms = 0; ms < 40_000; ms += 50) for (let i = 0; i < racers.length; i++) {
      const [x, y] = position(reader, i, ms);
      if (y < 44 || y > 63) continue;
      for (const p of PEGS.flat()) {
        const distance = Math.hypot(x - p.x, y - p.y);
        // Tolérance de contact Planck + interpolation du replay quantifié.
        expect(distance).toBeGreaterThan(p.radius + HEAD_RADIUS - 0.09);
        if (distance < 1.1) nearPins++;
      }
    }
    expect(nearPins).toBeGreaterThan(100);
  });

  it("l'horloge des hélices reste continue au passage du premier arrivant", () => {
    const r = planckEngine.simulate({ seed: "0x55", racers: racers.slice(0, 2) });
    const reader = new ReplayReader(r.replay);
    expect(physicalSeconds(reader, 40_000)).toBeCloseTo(r.replay.clock!.firstPhysical, 8);
    expect(physicalSeconds(reader, 40_001)).toBeGreaterThan(physicalSeconds(reader, 40_000));
    expect(physicalSeconds(reader, 40_001) - physicalSeconds(reader, 39_999)).toBeLessThan(0.1);
  });

  it("refuse un effectif invalide et accepte une course solo", () => {
    expect(() => planckEngine.simulate({ seed: "0x1", racers: [] })).toThrow();
    expect(() => planckEngine.simulate({ seed: "0x1", racers: [...racers, racers[0]] })).toThrow();
    const solo = planckEngine.simulate({ seed: "0x1", racers: racers.slice(0, 1) });
    expect(solo.durationMs).toBe(40_000);
  });
});
