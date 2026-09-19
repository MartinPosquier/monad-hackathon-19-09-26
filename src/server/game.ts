/**
 * Singleton du lobby, porté par globalThis : les route handlers peuvent être bundlés
 * séparément, et le rechargement à chaud de `next dev` ne doit pas vider les rooms.
 */
import { getEngine } from "@/sim";
import type { Address } from "viem";
import { submitRaceResult } from "./chain";
import { serverConfig } from "./config";
import { Lobby } from "./rooms";

const G = globalThis as typeof globalThis & { __msrLobby?: Lobby; __msrTimer?: ReturnType<typeof setInterval> };

export function getLobby(): Lobby {
  if (!G.__msrLobby) {
    const cfg = serverConfig();
    G.__msrLobby = new Lobby({
      engine: getEngine(),
      raceSize: cfg.raceSize,
      lobbyMs: cfg.lobbySeconds * 1000,
      prestartMs: cfg.prestartSeconds * 1000,
      onFinished: async (room) => {
        const c = serverConfig();
        if (c.mode !== "testnet" || !c.submitResults || !c.contract || !c.deployerKey) return null;
        const podium = room.result!.ranking.slice(0, 3).map((e) => room.racers[e.racerId].address as Address | null);
        return submitRaceResult(BigInt(room.raceId), room.result!.seed, podium);
      },
    });
    // Le timer fait avancer les courses même quand personne ne regarde (podium publié à l'heure).
    G.__msrTimer ??= setInterval(() => G.__msrLobby?.tick(), 500);
    G.__msrTimer.unref?.();
  }
  // Le singleton survit au hot reload ; appliquer le moteur courant sans perdre les rooms.
  // Migration en développement des instances créées avant l'ajout de setEngine.
  if (Object.getPrototypeOf(G.__msrLobby) !== Lobby.prototype) Object.setPrototypeOf(G.__msrLobby, Lobby.prototype);
  G.__msrLobby.setEngine(getEngine());
  return G.__msrLobby;
}
