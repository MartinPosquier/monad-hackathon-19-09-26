/**
 * Configuration serveur, relue à chaque appel : changer .env.local et redémarrer suffit,
 * aucun rebuild. Aucune variable NEXT_PUBLIC_ ici — elles seraient figées au build.
 */
import type { Address, Hex } from "viem";
import { DEFAULT_EXPLORER_URL, DEFAULT_RPC_URL, FAUCET_URL, MONAD_TESTNET_ID } from "@/shared/chain";
import type { ChainMode } from "@/shared/types";

function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function key(name: string): Hex | null {
  const v = process.env[name]?.trim();
  return v && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as Hex) : null;
}

export function serverConfig() {
  const contract = process.env.CONTRACT_ADDRESS?.trim();
  return {
    mode: (process.env.CHAIN_MODE === "testnet" ? "testnet" : "stub") as ChainMode,
    chainId: MONAD_TESTNET_ID,
    rpcUrl: process.env.MONAD_RPC_URL || DEFAULT_RPC_URL,
    explorerUrl: process.env.EXPLORER_URL || DEFAULT_EXPLORER_URL,
    faucetUrl: FAUCET_URL,
    contract: contract && /^0x[0-9a-fA-F]{40}$/.test(contract) ? (contract as Address) : null,
    /** Seuil du mode stub, et valeur passée au constructeur lors du déploiement. */
    threshold: int("QUALIFY_THRESHOLD", 5),
    raceSize: Math.min(Math.max(int("RACE_SIZE", 40), 2), 40),
    lobbySeconds: int("LOBBY_SECONDS", 45),
    prestartSeconds: int("PRESTART_SECONDS", 6),
    submitResults: process.env.SUBMIT_RESULTS !== "0",
    deployerKey: key("DEPLOYER_PRIVATE_KEY"),
    attestorKey: key("ATTESTOR_PRIVATE_KEY"),
    hostToken: process.env.HOST_TOKEN?.trim() || null,
  };
}

export type ServerConfig = ReturnType<typeof serverConfig>;
