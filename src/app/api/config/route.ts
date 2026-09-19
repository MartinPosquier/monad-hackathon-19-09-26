import { readThreshold } from "@/server/chain";
import { serverConfig } from "@/server/config";
import { handle } from "@/server/http";
import type { AppConfig } from "@/shared/types";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async (): Promise<AppConfig> => {
    const cfg = serverConfig();
    let threshold = cfg.threshold;
    // En testnet, le seuil fait foi sur le contrat (modifiable par setThreshold sans redéploiement).
    if (cfg.mode === "testnet" && cfg.contract) threshold = await readThreshold().catch(() => cfg.threshold);
    return {
      mode: cfg.mode,
      chainId: cfg.chainId,
      rpcUrl: cfg.rpcUrl,
      explorerUrl: cfg.explorerUrl,
      faucetUrl: cfg.faucetUrl,
      contract: cfg.contract,
      threshold,
      raceSize: cfg.raceSize,
      lobbySeconds: cfg.lobbySeconds,
      submitResults: cfg.submitResults,
    };
  });
}
