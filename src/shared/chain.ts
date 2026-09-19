/**
 * Constantes Monad partagées par le front, le serveur, les scripts et les tests.
 * Vérifiées sur le RPC le 19/09/2026 : chainId 0x279f, client Monad/0.16.2.
 */
import { defineChain, type Address } from "viem";
import { monadTestnet as viemMonadTestnet } from "viem/chains";

export const MONAD_TESTNET_ID = 10_143;
export const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
export const DEFAULT_EXPLORER_URL = "https://testnet.monadvision.com";
export const FAUCET_URL = "https://faucet.monad.xyz";

export function monadTestnet(rpcUrl = DEFAULT_RPC_URL, explorerUrl = DEFAULT_EXPLORER_URL) {
  return defineChain({
    ...viemMonadTestnet,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "MonadVision", url: explorerUrl } },
  });
}

// ─── Gas ────────────────────────────────────────────────────────────────────
// Monad facture le gas LIMIT, pas le gas utilisé : une marge large coûte réellement.
// Marge de 7,5 % recommandée par Category Labs, en points de base pour éviter les flottants.
export const GAS_LIMIT_MARGIN_BPS = 10_750n;

export function withGasMargin(estimatedGas: bigint): bigint {
  return (estimatedGas * GAS_LIMIT_MARGIN_BPS + 9_999n) / 10_000n;
}

// ─── EIP-712 : attestation de qualification ─────────────────────────────────
// Doit rester identique au contrat : name "SpermRace", version "1",
// Attestation(address player,uint256 txCount,uint256 deadline).
export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "player", type: "address" },
    { name: "txCount", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function attestationDomain(chainId: number, verifyingContract: Address) {
  return { name: "SpermRace", version: "1", chainId, verifyingContract } as const;
}

// ─── Affichage ──────────────────────────────────────────────────────────────
export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function explorerTx(explorerUrl: string, hash: string) {
  return `${explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddress(explorerUrl: string, address: string) {
  return `${explorerUrl.replace(/\/$/, "")}/address/${address}`;
}
