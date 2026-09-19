import { getAddress, isAddress, isHash } from "viem";
import { verifyJoinTx } from "@/server/chain";
import { serverConfig } from "@/server/config";
import { getLobby } from "@/server/game";
import { handle, HttpError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Entrée en course. En testnet, le joueur a déjà signé joinRace(raceId) : on relit le
 * reçu et l'event RaceJoined avant de l'admettre. Le ticket est brûlé on-chain, jamais ici.
 */
export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ address?: string; txHash?: string; name?: string }>(req);
    if (!body.address || !isAddress(body.address)) throw new HttpError(400, "invalid address");
    const address = getAddress(body.address);

    if (serverConfig().mode === "testnet") {
      if (!body.txHash || !isHash(body.txHash)) throw new HttpError(400, "missing joinRace transaction hash");
      await verifyJoinTx(body.txHash, address);
      return getLobby().join({ address, name: body.name, joinTx: body.txHash });
    }
    return getLobby().join({ address, name: body.name, joinTx: null });
  });
}
