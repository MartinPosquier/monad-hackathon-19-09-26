/**
 * Types partagés front ↔ serveur. Tout ce qui traverse une route /api passe par ici.
 * Les bigint voyagent en chaîne décimale (JSON ne sait pas les porter).
 */
import type { Address, Hash, Hex } from "viem";

export type { Address, Hash, Hex };

/** `stub` : aucun réseau, tout le monde est qualifié. `testnet` : contrat réel sur Monad. */
export type ChainMode = "stub" | "testnet";

export interface AppConfig {
  mode: ChainMode;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl: string;
  contract: Address | null;
  /** Seuil lu sur le contrat en mode testnet, dans QUALIFY_THRESHOLD en mode stub. */
  threshold: number;
  raceSize: number;
  lobbySeconds: number;
  submitResults: boolean;
}

// ─── Joueur ─────────────────────────────────────────────────────────────────

export interface PlayerStatus {
  address: Address;
  /** eth_getTransactionCount(address, "latest") : le nombre de tx envoyées. */
  nonce: number;
  threshold: number;
  qualified: boolean;
  tickets: number;
  racesJoined: number;
  /** Dernier txCount consommé par claimTicket (anti-rejeu). */
  lastAttestation: number;
}

/** Attestation EIP-712 signée par le serveur, à passer telle quelle à claimTicket(). */
export interface Attestation {
  player: Address;
  txCount: string;
  deadline: string;
  signature: Hex;
}

// ─── Course ─────────────────────────────────────────────────────────────────

export interface RacerEntry {
  /** Index dans la course, 0..raceSize-1. C'est aussi l'index dans le replay. */
  id: number;
  name: string;
  isBot: boolean;
  address: Address | null;
  /** Couleur unique, calculée par l'angle d'or : le jeu 3D la reprend telle quelle. */
  color: string;
  joinTx: Hash | null;
}

export interface RankingEntry {
  racerId: number;
  /** 1 = vainqueur. */
  rank: number;
  /** Temps d'arrivée depuis le départ, en ms. */
  finishMs: number;
}

/**
 * Trajectoires enregistrées. Format commun au stub et au futur moteur physique :
 * Int16 little-endian, ordre [frame][racer][channel], encodé en base64.
 * valeur réelle = int16 / scale. Le client rejoue, il ne resimule jamais.
 */
export interface ReplayData {
  track?: string;
  finishTimes?: number[];
  /** Conversion de l'horloge replay vers l'horloge physique pour les obstacles mobiles. */
  clock?: { firstPhysical: number; firstReplay?: number; headScale: number; tailScale: number; launchWindow?: number };
  /** Départs physiques et visibles, par salves de dix à 0, 1, 2 et 3 secondes. */
  releaseTimes?: number[];
  format: "int16-v1";
  engine: string;
  hz: number;
  frames: number;
  racers: number;
  /** 1 = progression 0..1 le long du parcours (stub). 2 = position x, y (moteur planck). */
  channels: number;
  scale: number;
  data: string;
}

export interface RaceResult {
  seed: Hex;
  engine: string;
  /** Arrivée du dernier racer. */
  durationMs: number;
  /** Trié par rang croissant. */
  ranking: RankingEntry[];
  replay: ReplayData;
}

export type RoomStatus = "open" | "starting" | "running" | "finished";

export interface RoomSummary {
  raceId: string;
  status: RoomStatus;
  createdAt: number;
  /** null tant qu'aucun humain n'a rejoint : le compte à rebours ne part qu'avec le premier. */
  lobbyEndsAt: number | null;
  startAt: number | null;
  finishAt: number | null;
  humans: number;
  size: number;
  racers: RacerEntry[];
}

export interface RaceDetail extends RoomSummary {
  seed: Hex | null;
  engine: string | null;
  durationMs: number | null;
  /** Disponible dès `starting` : le client précharge pendant le compte à rebours. */
  replay: ReplayData | null;
  /** Publié à `finished` seulement, pour ne pas gâcher le suspense. */
  ranking: RankingEntry[] | null;
  submitTx: Hash | null;
  submitError: string | null;
}

export interface PodiumEntry {
  rank: number;
  name: string;
  isBot: boolean;
  address: Address | null;
  finishMs: number;
}

export interface FinishedRaceSummary {
  raceId: string;
  finishedAt: number;
  seed: Hex;
  humans: number;
  podium: PodiumEntry[];
  submitTx: Hash | null;
}

export interface LobbyResponse {
  /** Horloge serveur : le client s'y cale pour que tout le monde parte ensemble. */
  now: number;
  open: RoomSummary;
  live: RoomSummary[];
  recent: FinishedRaceSummary[];
}

export interface LeaderboardRow {
  address: Address;
  name: string;
  races: number;
  wins: number;
  podiums: number;
  bestRank: number;
  avgRank: number;
  lastRaceId: string;
}

export interface ApiError {
  error: string;
}
