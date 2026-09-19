import { getAddress, isAddress } from "viem";
import { createAttestation } from "@/server/attest";
import { serverConfig } from "@/server/config";
import { handle, HttpError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Lit le nonce du joueur et renvoie une attestation EIP-712 à passer à claimTicket(). */
export function POST(req: Request) {
  return handle(async () => {
    const { address } = await readJson<{ address?: string }>(req);
    if (!address || !isAddress(address)) throw new HttpError(400, "invalid address");
    if (serverConfig().mode !== "testnet") throw new HttpError(400, "stub mode: no attestation needed");
    return createAttestation(getAddress(address));
  });
}
