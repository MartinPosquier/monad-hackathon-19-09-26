/**
 * Attestation de qualification.
 *
 *   serveur lit le nonce  →  signe une attestation EIP-712  →  le contrat vérifie la signature
 *      (off-chain)             (clé attestor)                   dans claimTicket()
 *
 * Aucun indexeur : `eth_getTransactionCount` donne exactement le compteur en un appel.
 */
import type { Address, Hex, LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ATTESTATION_TYPES, attestationDomain } from "@/shared/chain";
import type { Attestation } from "@/shared/types";
import { readNonce, readPlayer, readThreshold, requireContract } from "./chain";
import { serverConfig } from "./config";
import { HttpError } from "./http";

/** Durée de validité d'une attestation : largement de quoi signer dans MetaMask. */
export const ATTESTATION_TTL_SECONDS = 600;

/** Signature pure, sans réseau — utilisée telle quelle par les tests du contrat. */
export async function signAttestation(
  signer: LocalAccount,
  chainId: number,
  contract: Address,
  message: { player: Address; txCount: bigint; deadline: bigint },
): Promise<Hex> {
  return signer.signTypedData({
    domain: attestationDomain(chainId, contract),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message,
  });
}

export async function createAttestation(player: Address): Promise<Attestation> {
  const cfg = serverConfig();
  if (!cfg.attestorKey) throw new HttpError(503, "ATTESTOR_PRIVATE_KEY missing on the server");
  const contract = requireContract();

  const [nonce, threshold, state] = await Promise.all([readNonce(player), readThreshold(), readPlayer(player)]);
  if (nonce < threshold) {
    throw new HttpError(403, `not qualified yet: ${nonce} / ${threshold} transactions`);
  }
  if (nonce <= state.lastAttestation) {
    // Ne se produit que si le RPC du serveur est en retard sur la dernière tx du joueur.
    throw new HttpError(409, "your last ticket claim is not visible yet — retry in a second");
  }

  const txCount = BigInt(nonce);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS);
  const signature = await signAttestation(privateKeyToAccount(cfg.attestorKey), cfg.chainId, contract, {
    player,
    txCount,
    deadline,
  });
  return { player, txCount: txCount.toString(), deadline: deadline.toString(), signature };
}
