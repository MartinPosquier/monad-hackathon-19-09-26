/**
 * Point de branchement du moteur de course.
 *
 * Le lobby ne connaît que cette interface : il donne un seed et une liste d'inscrits, il
 * reçoit un classement et des trajectoires. La course entière est jouée d'un coup, côté
 * serveur, pendant le compte à rebours ; le client ne fait que rejouer.
 *
 * Le moteur `planck` est le circuit Cascade, avec collisions et replay (x, y) à 30 Hz.
 * Le moteur `stub` reste disponible pour les contrôles historiques et les diagnostics.
 */
import type { Hex, RaceResult, RacerEntry } from "@/shared/types";
import { stubEngine } from "./stubEngine";
import { planckEngine } from "./engine";

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
  [planckEngine.name]: planckEngine,
};

export function getEngine(name = process.env.RACE_ENGINE || "planck"): RaceEngine {
  const engine = ENGINES[name];
  if (!engine) throw new Error(`moteur de course inconnu : ${name} (disponibles : ${Object.keys(ENGINES).join(", ")})`);
  return engine;
}
