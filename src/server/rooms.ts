/**
 * Lobby en mémoire. Pas de base, pas de WebSocket : un singleton de module, interrogé en
 * polling 1 s par les clients.
 *
 * Cycle d'une room :
 *   open ──(premier humain : compte à rebours LOBBY_SECONDS, ou « Start now » de l'hôte)──▶
 *   starting ──(bots jusqu'à 50, seed tiré, course jouée d'un coup, départ à startAt)──▶
 *   running ──(startAt + durée)──▶ finished ──▶ podium publié on-chain
 *
 * Dès qu'une room quitte `open`, la suivante s'ouvre : on peut rejoindre la prochaine course
 * pendant que la précédente se joue.
 */
import { randomBytes } from "node:crypto";
import type { Address, Hash, Hex } from "viem";
import type { RaceEngine } from "@/sim";
import type {
  FinishedRaceSummary,
  LeaderboardRow,
  LobbyResponse,
  PodiumEntry,
  RaceDetail,
  RaceResult,
  RacerEntry,
  RoomStatus,
  RoomSummary,
} from "@/shared/types";
import { HttpError } from "./http";
import { botNames, playerName, racerColor } from "./racers";

/** Marge après l'arrivée du dernier, pour que chacun voie la fin avant le classement. */
const FINISH_GRACE_MS = 2_000;
const MAX_HISTORY = 20;

export interface LobbyOptions {
  engine: RaceEngine;
  raceSize: number;
  lobbyMs: number;
  prestartMs: number;
  now?: () => number;
  randomSeed?: () => Hex;
  /** Appelé une fois par course terminée — publication du podium on-chain. */
  onFinished?: (room: Room) => Promise<Hash | null>;
}

export interface Room {
  raceId: string;
  status: RoomStatus;
  createdAt: number;
  lobbyEndsAt: number | null;
  startAt: number | null;
  finishAt: number | null;
  racers: RacerEntry[];
  result: RaceResult | null;
  submitTx: Hash | null;
  submitError: string | null;
}

export interface JoinRequest {
  address: Address;
  name?: unknown;
  /** Tx joinRace vérifiée (mode testnet). null en mode stub. */
  joinTx: Hash | null;
}

export class Lobby {
  private readonly rooms = new Map<string, Room>();
  private openId!: string;
  private lastId = 0;
  private readonly usedTxs = new Set<string>();
  private readonly history: FinishedRaceSummary[] = [];
  private readonly stats = new Map<string, LeaderboardRow>();
  private readonly rankSums = new Map<string, number>();
  private readonly now: () => number;
  private readonly randomSeed: () => Hex;

  constructor(private readonly opts: LobbyOptions) {
    this.now = opts.now ?? Date.now;
    this.randomSeed = opts.randomSeed ?? (() => `0x${randomBytes(32).toString("hex")}` as Hex);
    this.openRoom();
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  lobby(): LobbyResponse {
    this.tick();
    const live = [...this.rooms.values()]
      .filter((r) => r.status === "starting" || r.status === "running")
      .map((r) => this.summary(r));
    return { now: this.now(), open: this.summary(this.open), live, recent: [...this.history] };
  }

  race(raceId: string): RaceDetail | null {
    this.tick();
    const room = this.rooms.get(raceId);
    if (!room) return null;
    const r = room.result;
    return {
      ...this.summary(room),
      seed: r?.seed ?? null,
      engine: r?.engine ?? null,
      durationMs: r?.durationMs ?? null,
      replay: r?.replay ?? null,
      ranking: room.status === "finished" ? (r?.ranking ?? null) : null,
      submitTx: room.submitTx,
      submitError: room.submitError,
    };
  }

  leaderboard(): LeaderboardRow[] {
    return [...this.stats.values()]
      .map((row) => ({ ...row }))
      .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || a.avgRank - b.avgRank || b.races - a.races);
  }

  get openRaceId(): string {
    return this.openId;
  }

  // ─── Écriture ─────────────────────────────────────────────────────────────

  /**
   * Admet un joueur dans la room ouverte. Un ticket brûlé pour une course déjà partie
   * n'est pas perdu : le joueur passe dans la suivante.
   */
  join(req: JoinRequest): { room: RoomSummary; racer: RacerEntry } {
    this.tick();
    const room = this.open;
    const addr = req.address.toLowerCase();

    const tx = req.joinTx?.toLowerCase();
    if (tx && this.usedTxs.has(tx)) throw new HttpError(409, "this joinRace transaction was already used");
    if (room.racers.some((r) => r.address?.toLowerCase() === addr)) {
      throw new HttpError(409, "you are already in this race");
    }
    if (room.racers.length >= this.opts.raceSize) throw new HttpError(409, "race is full — wait for the next one");
    if (tx) this.usedTxs.add(tx);

    const racer: RacerEntry = {
      id: room.racers.length,
      name: playerName(req.name, req.address),
      isBot: false,
      address: req.address,
      color: racerColor(room.racers.length),
      joinTx: req.joinTx,
    };
    room.racers.push(racer);
    if (room.lobbyEndsAt === null) room.lobbyEndsAt = this.now() + this.opts.lobbyMs;
    return { room: this.summary(room), racer };
  }

  /** « Start now » de l'hôte : lance la room ouverte, même vide (50 bots). */
  hostStart(): RoomSummary {
    this.tick();
    const room = this.open;
    room.lobbyEndsAt = this.now();
    this.tick();
    return this.summary(this.rooms.get(room.raceId)!);
  }

  /** Fait avancer toutes les rooms selon l'horloge. Idempotent, appelé à chaque requête et par un timer. */
  tick(): void {
    const now = this.now();
    const open = this.open;
    if (open.lobbyEndsAt !== null && now >= open.lobbyEndsAt) this.launch(open);

    for (const room of this.rooms.values()) {
      if (room.status === "starting" && now >= room.startAt!) room.status = "running";
      if (room.status === "running" && now >= room.finishAt!) this.finish(room);
    }
  }

  // ─── Interne ──────────────────────────────────────────────────────────────

  private get open(): Room {
    return this.rooms.get(this.openId)!;
  }

  private openRoom() {
    // raceId horodaté, strictement croissant : unique même après un redémarrage du serveur,
    // ce qui compte puisque le contrat fige le résultat de chaque raceId.
    const id = Math.max(this.now(), this.lastId + 1);
    this.lastId = id;
    const room: Room = {
      raceId: String(id),
      status: "open",
      createdAt: this.now(),
      lobbyEndsAt: null,
      startAt: null,
      finishAt: null,
      racers: [],
      result: null,
      submitTx: null,
      submitError: null,
    };
    this.rooms.set(room.raceId, room);
    this.openId = room.raceId;
  }

  private launch(room: Room) {
    const seed = this.randomSeed();
    for (const name of botNames(seed, this.opts.raceSize - room.racers.length)) {
      const id = room.racers.length;
      room.racers.push({ id, name, isBot: true, address: null, color: racerColor(id), joinTx: null });
    }

    // La course entière est jouée ici, avant la première image : le classement existe
    // avant que quiconque ne la regarde. Anti-triche par construction.
    room.result = this.opts.engine.simulate({ seed, racers: room.racers });
    room.status = "starting";
    room.startAt = this.now() + this.opts.prestartMs;
    room.finishAt = room.startAt + room.result.durationMs + FINISH_GRACE_MS;
    this.openRoom();
    this.prune();
  }

  private finish(room: Room) {
    room.status = "finished";
    const result = room.result!;
    const byId = new Map(room.racers.map((r) => [r.id, r]));

    const podium: PodiumEntry[] = result.ranking.slice(0, 3).map((e) => {
      const r = byId.get(e.racerId)!;
      return { rank: e.rank, name: r.name, isBot: r.isBot, address: r.address, finishMs: e.finishMs };
    });
    const summary: FinishedRaceSummary = {
      raceId: room.raceId,
      finishedAt: this.now(),
      seed: result.seed,
      humans: room.racers.filter((r) => !r.isBot).length,
      podium,
      submitTx: null,
    };
    this.history.unshift(summary);
    this.history.length = Math.min(this.history.length, MAX_HISTORY);

    for (const e of result.ranking) {
      const r = byId.get(e.racerId)!;
      if (r.isBot || !r.address) continue;
      const key = r.address.toLowerCase();
      const s = this.stats.get(key) ?? {
        address: r.address,
        name: r.name,
        races: 0,
        wins: 0,
        podiums: 0,
        bestRank: e.rank,
        avgRank: 0,
        lastRaceId: room.raceId,
      };
      const rankSum = (this.rankSums.get(key) ?? 0) + e.rank;
      s.name = r.name;
      s.races += 1;
      s.wins += e.rank === 1 ? 1 : 0;
      s.podiums += e.rank <= 3 ? 1 : 0;
      s.bestRank = Math.min(s.bestRank, e.rank);
      s.avgRank = Math.round((rankSum / s.races) * 10) / 10;
      s.lastRaceId = room.raceId;
      this.rankSums.set(key, rankSum);
      this.stats.set(key, s);
    }

    if (this.opts.onFinished) {
      this.opts
        .onFinished(room)
        .then((hash) => {
          room.submitTx = hash;
          summary.submitTx = hash;
        })
        .catch((e: unknown) => {
          room.submitError = e instanceof Error ? e.message.split("\n")[0] : String(e);
          console.error(`[race ${room.raceId}] submitResult a échoué :`, room.submitError);
        });
    }
  }

  /** Les replays pèsent ~100 Ko : on ne garde que les dernières courses terminées. */
  private prune() {
    const finished = [...this.rooms.values()].filter((r) => r.status === "finished");
    for (const r of finished.slice(0, Math.max(0, finished.length - MAX_HISTORY))) this.rooms.delete(r.raceId);
  }

  private summary(room: Room): RoomSummary {
    return {
      raceId: room.raceId,
      status: room.status,
      createdAt: room.createdAt,
      lobbyEndsAt: room.lobbyEndsAt,
      startAt: room.startAt,
      finishAt: room.finishAt,
      humans: room.racers.filter((r) => !r.isBot).length,
      size: this.opts.raceSize,
      racers: room.racers,
    };
  }
}
