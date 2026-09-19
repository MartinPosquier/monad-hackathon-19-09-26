/**
 * Change le seuil de qualification sur le contrat déployé, sans redéploiement.
 *
 *   npm run threshold -- 1000   le pitch
 *   npm run threshold -- 5      la démo live
 */
import { spermRaceAbi } from "../src/lib/contract/spermRace";
import { explorerTx, withGasMargin } from "../src/shared/chain";
import { clients, upsertEnv } from "./env";

const value = Number(process.argv[2]);
if (!Number.isInteger(value) || value < 0) throw new Error("usage : npm run threshold -- <nombre de tx>");

const { cfg, account, publicClient, wallet, chain } = clients();
if (!cfg.contract) throw new Error("CONTRACT_ADDRESS vide : déployer d'abord (npm run deploy).");

const args = [BigInt(value)] as const;
const estimated = await publicClient.estimateContractGas({
  address: cfg.contract,
  abi: spermRaceAbi,
  functionName: "setThreshold",
  args,
  account,
});
const hash = await wallet.writeContract({
  address: cfg.contract,
  abi: spermRaceAbi,
  functionName: "setThreshold",
  args,
  gas: withGasMargin(estimated),
  chain,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 100 });
if (receipt.status !== "success") throw new Error(`setThreshold reverté : ${hash}`);
upsertEnv({ QUALIFY_THRESHOLD: String(value) });
console.log(`Seuil = ${value} tx · ${explorerTx(cfg.explorerUrl, hash)}`);
console.log("Le serveur relit le seuil sur le contrat (cache 15 s) : pas besoin de redémarrer.");
