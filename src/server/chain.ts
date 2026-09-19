/**
 * Accès serveur au testnet Monad : lectures (nonce, joueur, seuil), vérification des
 * entrées en course, publication des podiums. Rien ici ne s'exécute en mode stub.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { spermRaceAbi } from "@/lib/contract/spermRace";
import { monadTestnet, withGasMargin } from "@/shared/chain";
import { serverConfig } from "./config";
import { HttpError } from "./http";

const G = globalThis as typeof globalThis & {
  __msrPublic?: { url: string; client: PublicClient };
  __msrThreshold?: { value: number; at: number; contract: Address };
  __msrTxQueue?: Promise<unknown>;
};

export function chain() {
  const cfg = serverConfig();
  return monadTestnet(cfg.rpcUrl, cfg.explorerUrl);
}

export function publicClient(): PublicClient {
  const { rpcUrl } = serverConfig();
  if (G.__msrPublic?.url !== rpcUrl) {
    G.__msrPublic = {
      url: rpcUrl,
      client: createPublicClient({ chain: chain(), transport: http(rpcUrl, { retryCount: 2 }) }) as PublicClient,
    };
  }
  return G.__msrPublic.client;
}

export function requireContract(): Address {
  const { contract } = serverConfig();
  if (!contract) throw new HttpError(503, "contract not deployed yet (CONTRACT_ADDRESS is empty)");
  return contract;
}

export async function readNonce(address: Address): Promise<number> {
  return publicClient().getTransactionCount({ address, blockTag: "latest" });
}

/** Seuil de qualification lu sur le contrat (source de vérité), mis en cache 15 s. */
export async function readThreshold(): Promise<number> {
  const contract = requireContract();
  const c = G.__msrThreshold;
  if (c && c.contract === contract && Date.now() - c.at < 15_000) return c.value;
  const value = Number(
    await publicClient().readContract({ address: contract, abi: spermRaceAbi, functionName: "threshold" }),
  );
  G.__msrThreshold = { value, at: Date.now(), contract };
  return value;
}

export async function readPlayer(address: Address) {
  const contract = requireContract();
  const [tickets, racesJoined, lastAttestation] = await publicClient().readContract({
    address: contract,
    abi: spermRaceAbi,
    functionName: "players",
    args: [address],
  });
  return { tickets: Number(tickets), racesJoined: Number(racesJoined), lastAttestation: Number(lastAttestation) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Vérifie qu'une tx est bien un joinRace réussi, envoyé par `player` sur NOTRE contrat,
 * et renvoie le raceId lu dans l'event RaceJoined. Le reçu peut arriver sur notre RPC
 * quelques centaines de ms après celui du wallet : on réessaie brièvement.
 */
export async function verifyJoinTx(hash: Hash, player: Address): Promise<{ raceId: bigint }> {
  const contract = requireContract();
  let receipt = null;
  for (let i = 0; i < 12 && !receipt; i++) {
    receipt = await publicClient()
      .getTransactionReceipt({ hash })
      .catch(() => null);
    if (!receipt) await sleep(400);
  }
  if (!receipt) throw new HttpError(404, "transaction not found on Monad testnet yet — retry in a few seconds");
  if (receipt.status !== "success") throw new HttpError(400, "joinRace transaction reverted");
  if (receipt.to?.toLowerCase() !== contract.toLowerCase()) {
    throw new HttpError(400, "transaction was not sent to the SpermRace contract");
  }

  const logs = parseEventLogs({ abi: spermRaceAbi, logs: receipt.logs, eventName: "RaceJoined" });
  const log = logs.find(
    (l) => l.address.toLowerCase() === contract.toLowerCase() && l.args.player.toLowerCase() === player.toLowerCase(),
  );
  if (!log) throw new HttpError(400, "no RaceJoined event for this player in that transaction");
  return { raceId: log.args.raceId };
}

/**
 * Publie seed + podium. Les tx serveur sont sérialisées : Monad n'a pas de mempool
 * global, un nonce « pending » n'est pas fiable, donc une tx à la fois, reçu compris.
 */
export function submitRaceResult(raceId: bigint, seed: Hex, podium: (Address | null)[]): Promise<Hash> {
  const run = async (): Promise<Hash> => {
    const cfg = serverConfig();
    const contract = requireContract();
    if (!cfg.deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY missing");
    const account = privateKeyToAccount(cfg.deployerKey);
    const wallet = createWalletClient({ account, chain: chain(), transport: http(cfg.rpcUrl) });
    const args = [raceId, seed, [0, 1, 2].map((i) => podium[i] ?? zeroAddress) as [Address, Address, Address]] as const;

    const estimated = await publicClient().estimateContractGas({
      address: contract,
      abi: spermRaceAbi,
      functionName: "submitResult",
      args,
      account,
    });
    const hash = await wallet.writeContract({
      address: contract,
      abi: spermRaceAbi,
      functionName: "submitResult",
      args,
      gas: withGasMargin(estimated),
    });
    const receipt = await publicClient().waitForTransactionReceipt({ hash, pollingInterval: 200, timeout: 30_000 });
    if (receipt.status !== "success") throw new Error(`submitResult reverted (${hash})`);
    return hash;
  };
  const next = (G.__msrTxQueue ?? Promise.resolve()).then(run, run);
  G.__msrTxQueue = next.catch(() => undefined);
  return next;
}
