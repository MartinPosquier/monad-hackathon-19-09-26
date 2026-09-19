/** Cycle de vie du lobby, avec une horloge simulée : aucune attente réelle. */
import type { Address, Hash, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lobby, type Room } from "@/server/rooms";
import { HttpError } from "@/server/http";
import { stubEngine } from "@/sim/stubEngine";

const LOBBY_MS = 45_000;
const PRESTART_MS = 6_000;
const A = "0x1111111111111111111111111111111111111111" as Address;
const B = "0x2222222222222222222222222222222222222222" as Address;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hash;

let clock: number;
let seeds: number;
let finished: Room[];

function makeLobby(onFinished?: (room: Room) => Promise<Hash | null>) {
  return new Lobby({
    engine: stubEngine,
    raceSize: 40,
    lobbyMs: LOBBY_MS,
    prestartMs: PRESTART_MS,
    now: () => clock,
    randomSeed: () => `0x${(++seeds).toString(16).padStart(64, "a")}` as Hex,
    onFinished:
      onFinished ??
      (async (room) => {
        finished.push(room);
        return tx(999);
      }),
  });
}

beforeEach(() => {
  clock = 1_800_000_000_000;
  seeds = 0;
  finished = [];
});

describe("room ouverte", () => {
  it("n'a pas de compte à rebours tant que personne n'a rejoint", () => {
    const lobby = makeLobby();
    clock += 10 * 60_000;
    const { open, live } = lobby.lobby();
    expect(open.status).toBe("open");
    expect(open.lobbyEndsAt).toBeNull();
    expect(live).toEqual([]);
  });

  it("lance le compte à rebours au premier joueur", () => {
    const lobby = makeLobby();
    const { room, racer } = lobby.join({ address: A, name: "Alice", joinTx: tx(1) });
    expect(room.lobbyEndsAt).toBe(clock + LOBBY_MS);
    expect(racer).toMatchObject({ id: 0, name: "Alice", isBot: false, address: A });
  });

  it("refuse deux fois la même adresse, et deux fois la même tx", () => {
    const lobby = makeLobby();
    lobby.join({ address: A, joinTx: tx(1) });
    expect(() => lobby.join({ address: A, joinTx: tx(2) })).toThrow(HttpError);
    expect(() => lobby.join({ address: B, joinTx: tx(1) })).toThrow(/already used/);
  });

  it("ne consomme pas la tx d'une entrée refusée", () => {
    const lobby = makeLobby();
    lobby.join({ address: A, joinTx: tx(1) });
    expect(() => lobby.join({ address: A, joinTx: tx(2) })).toThrow(/already in this race/);
    expect(() => lobby.join({ address: B, joinTx: tx(2) })).not.toThrow();
  });

  it("accepte un ticket pour la room ouverte même restée vide longtemps (régression audit P1 n° 1)", () => {
    const lobby = makeLobby();
    const open = lobby.openRaceId;
    clock += 16 * 60_000;
    expect(lobby.join({ address: A, joinTx: tx(1), ticketRaceId: open }).room.raceId).toBe(open);
  });

  it("refuse un joinRace visant une course inconnue : rejeu après redémarrage, course future", () => {
    const before = makeLobby();
    const oldRace = before.openRaceId;
    before.join({ address: A, joinTx: tx(1), ticketRaceId: oldRace });
    clock += 1_000;
    const restarted = makeLobby(); // redémarrage : la liste des tx utilisées est vide
    expect(() => restarted.join({ address: A, joinTx: tx(1), ticketRaceId: oldRace })).toThrow(/does not know/);
    const future = String(BigInt(restarted.openRaceId) + 1n);
    expect(() => restarted.join({ address: B, joinTx: tx(2), ticketRaceId: future })).toThrow(/does not know/);
  });

  it("rend l'inscription existante si la même tx est rejouée (réponse HTTP perdue)", () => {
    const lobby = makeLobby();
    const first = lobby.join({ address: A, name: "Alice", joinTx: tx(1), ticketRaceId: lobby.openRaceId });
    const again = lobby.join({ address: A, name: "Alice", joinTx: tx(1), ticketRaceId: lobby.openRaceId });
    expect(again.racer).toEqual(first.racer);
    expect(again.room.racers).toHaveLength(1);
    expect(() => lobby.join({ address: B, joinTx: tx(1) })).toThrow(/already used/);
  });

  it("une room pleine part aussitôt et le ticket suivant entre dans la course d'après", () => {
    const lobby = makeLobby();
    const full = lobby.openRaceId;
    for (let i = 0; i < 40; i++) {
      const address = `0x${(i + 16).toString(16).padStart(40, "0")}` as Address;
      lobby.join({ address, joinTx: tx(100 + i), ticketRaceId: full });
    }
    const late = lobby.join({ address: A, joinTx: tx(1), ticketRaceId: full });
    expect(late.room.raceId).not.toBe(full);
    expect(lobby.race(full)!.status).toBe("starting");
  });

  it("nettoie les pseudos et retombe sur l'adresse abrégée", () => {
    const lobby = makeLobby();
    expect(lobby.join({ address: A, name: "<script>x</script>", joinTx: null }).racer.name).toBe("scriptxscript");
    expect(lobby.join({ address: B, name: "   ", joinTx: null }).racer.name).toBe("0x2222…2222");
  });
});

describe("course complète", () => {
  it("open → starting → running → finished, bots jusqu'à 40, podium publié", async () => {
    const lobby = makeLobby();
    lobby.join({ address: A, name: "Alice", joinTx: tx(1) });
    lobby.join({ address: B, name: "Bob", joinTx: tx(2) });
    const raceId = lobby.openRaceId;

    clock += LOBBY_MS;
    const afterLaunch = lobby.lobby();
    expect(afterLaunch.open.raceId).not.toBe(raceId);
    expect(BigInt(afterLaunch.open.raceId)).toBeGreaterThan(BigInt(raceId));
    const starting = lobby.race(raceId)!;
    expect(starting.status).toBe("starting");
    expect(starting.racers).toHaveLength(40);
    expect(starting.racers.filter((r) => r.isBot)).toHaveLength(38);
    expect(starting.racers.slice(0, 2).map((r) => r.name)).toEqual(["Alice", "Bob"]);
    expect(starting.replay).not.toBeNull();
    expect(starting.ranking).toBeNull(); // pas de spoiler avant la fin
    expect(new Set(starting.racers.map((r) => r.color)).size).toBe(40);

    clock = starting.startAt!;
    expect(lobby.race(raceId)!.status).toBe("running");

    clock = starting.finishAt!;
    const done = lobby.race(raceId)!;
    expect(done.status).toBe("finished");
    expect(done.ranking).toHaveLength(40);
    expect(finished.map((r) => r.raceId)).toEqual([raceId]);

    await vi.waitFor(() => expect(lobby.race(raceId)!.submitTx).toBe(tx(999)));
    const [summary] = lobby.lobby().recent;
    expect(summary.raceId).toBe(raceId);
    expect(summary.podium).toHaveLength(3);
    expect(summary.submitTx).toBe(tx(999));

    const board = lobby.leaderboard();
    expect(board.map((r) => r.address).sort()).toEqual([A, B].sort());
    for (const row of board) {
      expect(row.races).toBe(1);
      expect(row.bestRank).toBeGreaterThanOrEqual(1);
      expect(row.avgRank).toBe(row.bestRank);
    }
  });

  it("« Start now » lance une course de 40 bots même sans humain (démo sans chaîne)", () => {
    const lobby = makeLobby();
    const raceId = lobby.openRaceId;
    const started = lobby.hostStart();
    expect(started.raceId).toBe(raceId);
    expect(started.status).toBe("starting");
    expect(started.racers.every((r) => r.isBot)).toBe(true);
    expect(started.racers).toHaveLength(40);
  });

  it("un ticket brûlé pendant qu'une course part donne une place dans la suivante", () => {
    const lobby = makeLobby();
    lobby.join({ address: A, joinTx: tx(1) });
    const first = lobby.openRaceId;
    clock += LOBBY_MS;
    lobby.tick();
    const { room } = lobby.join({ address: B, joinTx: tx(2) });
    expect(room.raceId).not.toBe(first);
    expect(room.status).toBe("open");
  });

  it("un échec de publication on-chain n'arrête pas le lobby", async () => {
    const lobby = makeLobby(async () => {
      throw new Error("insufficient balance\nstack…");
    });
    const raceId = lobby.hostStart().raceId;
    clock = lobby.race(raceId)!.finishAt!;
    lobby.tick();
    await vi.waitFor(() => expect(lobby.race(raceId)!.submitError).toBe("insufficient balance"));
    expect(lobby.lobby().open.status).toBe("open");
  });

  it("même seed, même classement : le résultat existe avant la première image", () => {
    const a = makeLobby();
    const idA = a.hostStart().raceId;
    seeds = 0;
    const b = makeLobby();
    const idB = b.hostStart().raceId;
    clock += 200_000;
    expect(a.race(idA)!.ranking).toEqual(b.race(idB)!.ranking);
  });
});
