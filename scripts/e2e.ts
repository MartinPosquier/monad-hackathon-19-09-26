/**
 * Boucle complète sur le testnet, sans navigateur : la clé du deployer joue le joueur.
 *
 *   qualification (tx à soi-même) → /api/proof → claimTicket → joinRace → /api/join
 *   → « Start now » → course → classement → RaceFinished relu on-chain
 *
 * Exige le serveur lancé (npm run dev) en CHAIN_MODE=testnet avec le contrat déployé.
 * Coût : quelques tx de gas (~0,01 MON). Imprime les temps de confirmation mesurés.
 *
 *   npm run e2e
 */
import { parseEventLogs, type Hash, type Hex } from "viem";
import { spermRaceAbi } from "../src/lib/contract/spermRace";
import { explorerTx, withGasMargin } from "../src/shared/chain";
import type { AppConfig, Attestation, LobbyResponse, RaceDetail } from "../src/shared/types";
import { clients } from "./env";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const { cfg, account, publicClient, wallet, chain } = clients();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timings: { step: string; ms: number; hash: Hash }[] = [];

async function api<T>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${path} → ${res.status} ${data.error}`);
  return data;
}

/** Envoie, puis chronomètre de la diffusion au reçu — ce que voit le joueur. */
async function timed(step: string, send: () => Promise<Hash>) {
  const hash = await send();
  const t0 = performance.now();
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 50 });
  const ms = Math.round(performance.now() - t0);
  if (receipt.status !== "success") throw new Error(`${step} reverté : ${hash}`);
  timings.push({ step, ms, hash });
  console.log(`  ✓ ${step.padEnd(22)} ${String(ms).padStart(5)} ms  ${explorerTx(cfg.explorerUrl, hash)}`);
  return receipt;
}

const config = await api<AppConfig>("/api/config");
if (config.mode !== "testnet" || !config.contract) throw new Error("le serveur n'est pas en CHAIN_MODE=testnet avec un contrat");
const contract = config.contract;
console.log(`serveur ${BASE} · contrat ${contract} · seuil ${config.threshold}`);
console.log(`joueur  ${account.address}\n`);

// 1. Qualification : tx à 0 MON vers soi-même, gas 21 000 pile.
let nonce = await publicClient.getTransactionCount({ address: account.address });
while (nonce < config.threshold) {
  await timed(`qualif ${nonce + 1}/${config.threshold}`, () =>
    wallet.sendTransaction({ to: account.address, value: 0n, gas: 21_000n, chain }),
  );
  nonce += 1;
}
// Le serveur lit « latest » sur son propre RPC : on attend qu'il voie le même compteur.
for (let i = 0; i < 20; i++) {
  const seen = await api<{ nonce: number }>(`/api/player/${account.address}`);
  if (seen.nonce >= config.threshold) break;
  await sleep(300);
}

// 2. Attestation serveur puis claimTicket signé par le joueur.
const att = await api<Attestation>("/api/proof", { method: "POST", body: { address: account.address } });
const claimArgs = [BigInt(att.txCount), BigInt(att.deadline), att.signature as Hex] as const;
const claimGas = await publicClient.estimateContractGas({
  address: contract,
  abi: spermRaceAbi,
  functionName: "claimTicket",
  args: claimArgs,
  account,
});
await timed("claimTicket", () =>
  wallet.writeContract({ address: contract, abi: spermRaceAbi, functionName: "claimTicket", args: claimArgs, gas: withGasMargin(claimGas), chain }),
);

// 3. joinRace sur la room ouverte, puis admission par le serveur.
const lobby = await api<LobbyResponse>("/api/lobby");
const raceId = lobby.open.raceId;
const joinGas = await publicClient.estimateContractGas({
  address: contract,
  abi: spermRaceAbi,
  functionName: "joinRace",
  args: [BigInt(raceId)],
  account,
});
const joinReceipt = await timed("joinRace", () =>
  wallet.writeContract({ address: contract, abi: spermRaceAbi, functionName: "joinRace", args: [BigInt(raceId)], gas: withGasMargin(joinGas), chain }),
);
const joined = await api<{ room: { raceId: string } }>("/api/join", {
  method: "POST",
  body: { address: account.address, txHash: joinReceipt.transactionHash, name: "e2e" },
});
console.log(`  ✓ admis dans la course ${joined.room.raceId}`);

// 4. Départ immédiat (hôte), puis attente de la fin.
if (!cfg.hostToken) throw new Error("HOST_TOKEN absent");
await api("/api/host", { method: "POST", headers: { "x-host-token": cfg.hostToken } });
const id = joined.room.raceId;
let race = await api<RaceDetail>(`/api/race/${id}`);
console.log(`  … course ${id} lancée, arrivée dans ~${Math.round(((race.finishAt ?? 0) - Date.now()) / 1000)} s`);
while (race.status !== "finished") {
  await sleep(2000);
  race = await api<RaceDetail>(`/api/race/${id}`);
}
const me = race.racers.find((r) => r.address?.toLowerCase() === account.address.toLowerCase())!;
const myRank = race.ranking!.find((e) => e.racerId === me.id)!;
console.log(`  ✓ classement : #${myRank.rank} / ${race.ranking!.length} en ${(myRank.finishMs / 1000).toFixed(3)} s`);

// 5. Podium publié : on relit l'event et on le compare au classement du serveur.
for (let i = 0; i < 30 && !race.submitTx && !race.submitError; i++) {
  await sleep(1000);
  race = await api<RaceDetail>(`/api/race/${id}`);
}
if (!race.submitTx) throw new Error(`podium non publié : ${race.submitError ?? "délai dépassé"}`);
const receipt = await publicClient.getTransactionReceipt({ hash: race.submitTx });
const [ev] = parseEventLogs({ abi: spermRaceAbi, logs: receipt.logs, eventName: "RaceFinished" });
const expected = race.ranking!.slice(0, 3).map((e) => race.racers[e.racerId].address?.toLowerCase() ?? "0x0000000000000000000000000000000000000000");
const ok =
  ev.args.raceId === BigInt(id) &&
  ev.args.seed === race.seed &&
  ev.args.podium.map((a) => a.toLowerCase()).join() === expected.join();
console.log(`  ${ok ? "✓" : "✗"} RaceFinished on-chain ${ok ? "conforme" : "DIVERGENT"} : ${explorerTx(cfg.explorerUrl, race.submitTx)}`);

const avg = Math.round(timings.reduce((s, t) => s + t.ms, 0) / timings.length);
console.log(`\n${timings.length} tx · confirmation moyenne ${avg} ms (min ${Math.min(...timings.map((t) => t.ms))}, max ${Math.max(...timings.map((t) => t.ms))})`);
process.exitCode = ok ? 0 : 1;
