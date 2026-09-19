/**
 * BlockchainService stub : aucun réseau, aucun wallet. Écrit en premier, il permet de
 * construire et démontrer tout le jeu sans chaîne — y compris si le testnet est réinitialisé
 * le jour J. Les délais imitent la finalité Monad (~600 ms).
 */
import type { Address, Hash } from "viem";
import type { AppConfig, PlayerStatus } from "@/shared/types";
import { api } from "../api";
import type { BlockchainService, JoinOutcome, OnStage, TxTiming } from "./types";

const KEY = "msr.stub.v1";

interface StubState {
  address: Address;
  nonce: number;
  tickets: number;
  racesJoined: number;
  lastAttestation: number;
  connected: boolean;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class StubBlockchainService implements BlockchainService {
  readonly mode = "stub" as const;
  private listeners = new Set<(a: Address | null) => void>();

  constructor(private readonly config: AppConfig) {}

  private load(): StubState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as StubState;
    } catch {
      /* stockage indisponible : état neuf */
    }
    // « Qualifié » d'emblée : le stub renvoie une adresse déjà au seuil.
    return {
      address: `0x${randomHex(20)}` as Address,
      nonce: this.config.threshold,
      tickets: 0,
      racesJoined: 0,
      lastAttestation: 0,
      connected: false,
    };
  }

  private save(s: StubState) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignoré */
    }
  }

  private async fakeTx(onStage: OnStage | undefined, apply: (s: StubState) => void): Promise<TxTiming> {
    onStage?.({ stage: "signing" });
    await sleep(350);
    const hash = `0x${randomHex(32)}` as Hash;
    const sentAt = performance.now();
    onStage?.({ stage: "pending", hash, sentAt });
    await sleep(520 + Math.random() * 180);
    const s = this.load();
    s.nonce += 1;
    apply(s);
    this.save(s);
    const confirmedAt = performance.now();
    const timing: TxTiming = { hash, sentAt, confirmedAt, ms: Math.round(confirmedAt - sentAt), blockNumber: null };
    onStage?.({ stage: "confirmed", timing });
    return timing;
  }

  async connectWallet(): Promise<Address> {
    const s = this.load();
    s.connected = true;
    this.save(s);
    this.listeners.forEach((cb) => cb(s.address));
    return s.address;
  }

  async restoreWallet(): Promise<Address | null> {
    const s = this.load();
    return s.connected ? s.address : null;
  }

  onAccountChange(cb: (address: Address | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async getTransactionCount(): Promise<number> {
    return this.load().nonce;
  }

  async checkEligibility(address: Address): Promise<PlayerStatus> {
    const s = this.load();
    return {
      address,
      nonce: s.nonce,
      threshold: this.config.threshold,
      qualified: s.nonce >= this.config.threshold,
      tickets: s.tickets,
      racesJoined: s.racesJoined,
      lastAttestation: s.lastAttestation,
    };
  }

  sendQualifyingTx(onStage?: OnStage): Promise<TxTiming> {
    return this.fakeTx(onStage, () => undefined);
  }

  claimTicket(onStage?: OnStage): Promise<TxTiming> {
    const before = this.load();
    if (before.nonce < this.config.threshold) return Promise.reject(new Error("not qualified yet"));
    const txCount = before.nonce;
    return this.fakeTx(onStage, (s) => {
      s.tickets += 1;
      s.lastAttestation = txCount;
    });
  }

  async joinRace(_raceId: string, name: string, onStage?: OnStage): Promise<JoinOutcome> {
    if (this.load().tickets < 1) throw new Error("no ticket — claim one first");
    const timing = await this.fakeTx(onStage, (s) => {
      s.tickets -= 1;
      s.racesJoined += 1;
    });
    const out = await api<Omit<JoinOutcome, "timing">>("/api/join", {
      method: "POST",
      body: { address: this.load().address, name },
    });
    return { ...out, timing };
  }

  async submitResult(): Promise<never> {
    throw new Error("submitResult is signed by the server, never from the browser");
  }
}
