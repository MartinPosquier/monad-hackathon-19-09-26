/**
 * Point de branchement du moteur de course.
 *
 * Le lobby ne connaît que cette interface : il donne un seed et une liste d'inscrits, il
 * reçoit un classement et des trajectoires. La course entière est jouée d'un coup, côté
 * serveur, pendant le compte à rebours ; le client ne fait que rejouer.
 *
 * Aujourd'hui seul le moteur `stub` existe (progression seedée, sans physique). Le moteur
 * planck (jalon 1 du plan : src/sim/track.ts + src/sim/engine.ts) s'enregistre ici, avec
 * un replay à 2 canaux (x, y), sans toucher au lobby ni à l'UI.
 */
import type { Hex, RaceResult, RacerEntry } from "@/shared/types";
import { stubEngine } from "./stubEngine";

export interface RaceInput {
  seed: Hex;
  racers: RacerEntry[];
}

export interface RaceEngine {
  readonly name: string;
  /** Déterministe : même seed + mêmes inscrits (même ordre) = même résultat. */
  simulate(input: RaceInput): RaceResult;
}

const ENGINES: Record<string, RaceEngine> = {
  [stubEngine.name]: stubEngine,
};

export function getEngine(name = process.env.RACE_ENGINE || "stub"): RaceEngine {
  const engine = ENGINES[name];
  if (!engine) throw new Error(`moteur de course inconnu : ${name} (disponibles : ${Object.keys(ENGINES).join(", ")})`);
  return engine;
}
