/**
 * Moteur stub : aucune physique. Tire pour chaque racer un temps d'arrivée et une
 * progression ondulée, à partir du seed. Sert à faire tourner toute la boucle
 * (lobby → course → classement → podium on-chain) avant que le moteur planck existe.
 *
 * Il respecte le même contrat que le vrai moteur : déterministe, 50 arrivants,
 * course de 60 à 80 s, écart premier–dernier sous 20 s.
 */
import { int16ToBase64 } from "@/shared/replay";
import type { RaceResult, RankingEntry } from "@/shared/types";
import type { RaceEngine, RaceInput } from "./index";
import { forkRng } from "./prng";

const HZ = 10;
const SCALE = 32767;
const MIN_FINISH_MS = 60_000;
const SPREAD_MS = 18_000;

interface Profile {
  finishMs: number;
  amplitude: number;
  frequency: number;
  phase: number;
}

function progressAt(p: Profile, tMs: number): number {
  if (tMs >= p.finishMs) return 1;
  const x = tMs / p.finishMs;
  // L'ondulation s'annule au départ et à l'arrivée : tout le monde part ensemble,
  // chacun franchit la ligne exactement à son temps.
  const wobble = p.amplitude * Math.sin(Math.PI * x) * Math.sin(2 * Math.PI * p.frequency * x + p.phase);
  return Math.min(Math.max(x + wobble, 0), 0.999);
}

export const stubEngine: RaceEngine = {
  name: "stub",

  simulate({ seed, racers }: RaceInput): RaceResult {
    const profiles: Profile[] = racers.map((r) => {
      const rng = forkRng(seed, `racer:${r.id}`);
      return {
        finishMs: Math.round(MIN_FINISH_MS + rng() * SPREAD_MS),
        amplitude: 0.015 + rng() * 0.035,
        frequency: 1.5 + rng() * 3,
        phase: rng() * Math.PI * 2,
      };
    });

    const ranking: RankingEntry[] = racers
      .map((r, i) => ({ racerId: r.id, rank: 0, finishMs: profiles[i].finishMs }))
      .sort((a, b) => a.finishMs - b.finishMs || a.racerId - b.racerId)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    const durationMs = Math.max(...profiles.map((p) => p.finishMs));
    const frames = Math.ceil((durationMs / 1000) * HZ) + 1;
    const samples = new Int16Array(frames * racers.length);
    for (let f = 0; f < frames; f++) {
      const t = (f / HZ) * 1000;
      for (let i = 0; i < racers.length; i++) {
        samples[f * racers.length + i] = Math.round(progressAt(profiles[i], t) * SCALE);
      }
    }

    return {
      seed,
      engine: "stub",
      durationMs,
      ranking,
      replay: {
        format: "int16-v1",
        engine: "stub",
        hz: HZ,
        frames,
        racers: racers.length,
        channels: 1,
        scale: SCALE,
        data: int16ToBase64(samples),
      },
    };
  },
};
