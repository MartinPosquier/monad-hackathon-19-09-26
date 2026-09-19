/**
 * BlockchainService — la seule porte entre le jeu et la chaîne.
 *
 * Deux implémentations : `stub` (aucun réseau, tout le monde est qualifié) et `viem`
 * (MetaMask sur le testnet Monad). Le choix se fait par CHAIN_MODE dans .env.local.
 * C'est aussi l'abstraction qui permettra de remplacer la règle des 1000 tx plus tard.
 */
import type { Address, Hash } from "viem";
import type { ChainMode, PlayerStatus, RacerEntry, RoomSummary } from "@/shared/types";

export interface TxTiming {
  hash: Hash;
  /** Instant où le wallet a diffusé la tx (hash reçu). */
  sentAt: number;
  /** Instant où le reçu a été observé. */
  confirmedAt: number;
  /** confirmedAt − sentAt : l'argument Monad, affiché à l'écran. */
  ms: number;
  blockNumber: bigint | null;
}

export type TxStage =
  | { stage: "signing" }
  | { stage: "pending"; hash: Hash; sentAt: number }
  | { stage: "confirmed"; timing: TxTiming };

export type OnStage = (s: TxStage) => void;

export interface JoinOutcome {
  timing: TxTiming | null;
  room: RoomSummary;
  racer: RacerEntry;
}

export interface BlockchainService {
  readonly mode: ChainMode;

  /** Ouvre le wallet, bascule sur Monad testnet (ajout du réseau si besoin), renvoie l'adresse. */
  connectWallet(): Promise<Address>;
  /** Reconnexion silencieuse au rechargement de la page, sans popup. */
  restoreWallet(): Promise<Address | null>;
  onAccountChange(cb: (address: Address | null) => void): () => void;

  /** eth_getTransactionCount — le compteur exact, sans indexeur. */
  getTransactionCount(address: Address): Promise<number>;
  checkEligibility(address: Address): Promise<PlayerStatus>;

  /** Tx à 0 MON vers soi-même, signée par le joueur : pour atteindre le seuil pendant la démo. */
  sendQualifyingTx(onStage?: OnStage): Promise<TxTiming>;
  /** Demande l'attestation au serveur puis signe claimTicket(). */
  claimTicket(onStage?: OnStage): Promise<TxTiming>;
  /** Signe joinRace(raceId), puis fait admettre le joueur par le serveur. */
  joinRace(raceId: string, name: string, onStage?: OnStage): Promise<JoinOutcome>;
  /** Publication du podium : réservée au serveur (clé owner), jamais appelée depuis le navigateur. */
  submitResult(): Promise<never>;
}

export class UserFacingError extends Error {}
