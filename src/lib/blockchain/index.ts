import type { AppConfig } from "@/shared/types";
import { StubBlockchainService } from "./stub";
import type { BlockchainService } from "./types";
import { ViemBlockchainService } from "./viem";

export type { BlockchainService, JoinOutcome, OnStage, TxStage, TxTiming } from "./types";
export { UserFacingError } from "./types";

/** Stub ↔ réel : piloté par CHAIN_MODE dans .env.local, servi par /api/config. */
export function createBlockchainService(config: AppConfig): BlockchainService {
  return config.mode === "testnet" ? new ViemBlockchainService(config) : new StubBlockchainService(config);
}
