import { getAddress, isAddress } from "viem";
import { readNonce, readPlayer, readThreshold } from "@/server/chain";
import { serverConfig } from "@/server/config";
import { handle, HttpError } from "@/server/http";
import type { PlayerStatus } from "@/shared/types";

export const dynamic = "force-dynamic";

export function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  return handle(async (): Promise<PlayerStatus> => {
    const { address: raw } = await ctx.params;
    if (!isAddress(raw)) throw new HttpError(400, "invalid address");
    if (serverConfig().mode !== "testnet") throw new HttpError(400, "stub mode: player status lives in the browser");
    const address = getAddress(raw);
    const [nonce, threshold, state] = await Promise.all([readNonce(address), readThreshold(), readPlayer(address)]);
    return { address, nonce, threshold, qualified: nonce >= threshold, ...state };
  });
}
