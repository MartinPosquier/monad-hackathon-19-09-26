/**
 * Déploie SpermRace sur le testnet Monad en une commande, et écrit l'adresse dans .env.local.
 * C'est la parade au reset du testnet : on relance, c'est reparti.
 *
 *   npm run deploy                 déploie et bascule CHAIN_MODE=testnet
 *   npm run deploy -- --keep-mode  déploie sans toucher à CHAIN_MODE
 */
import { encodeDeployData, formatEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { spermRaceAbi } from "../src/lib/contract/spermRace";
import { explorerAddress, explorerTx, withGasMargin } from "../src/shared/chain";
import { compileSpermRace } from "./compile";
import { clients, upsertEnv } from "./env";

const { cfg, account, publicClient, wallet, chain } = clients();
if (!cfg.attestorKey) throw new Error("ATTESTOR_PRIVATE_KEY absente : lancer `npm run setup` d'abord.");

const chainId = await publicClient.getChainId();
if (chainId !== chain.id) throw new Error(`RPC sur la chaîne ${chainId}, attendu ${chain.id}`);

// Recompilé à chaque déploiement : le bytecode déployé correspond toujours au source.
const art = compileSpermRace();
if (JSON.stringify(art.abi) !== JSON.stringify(spermRaceAbi)) {
  throw new Error("L'ABI du front ne correspond plus au contrat : lancer `npm run compile` puis redémarrer le serveur.");
}
const attestor = privateKeyToAccount(cfg.attestorKey).address;
const args = [attestor, BigInt(cfg.threshold)] as const;

const [balance, gasPrice, estimated] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.getGasPrice(),
  publicClient.estimateGas({
    account,
    data: encodeDeployData({ abi: spermRaceAbi, bytecode: art.bytecode, args }),
  }),
]);
// Monad facture le gas limit : estimation × 1,075, jamais un limit arbitraire.
const gas = withGasMargin(estimated);
const cost = gas * gasPrice;
console.log(`deployer  ${account.address} · ${formatEther(balance)} MON`);
console.log(`attestor  ${attestor}`);
console.log(`seuil     ${cfg.threshold} tx`);
console.log(`gas       estimé ${estimated} → limit ${gas} · coût max ${formatEther(cost)} MON`);
if (balance < cost) throw new Error("Solde insuffisant pour déployer : alimenter le deployer (npm run balance).");

const hash = await wallet.deployContract({ abi: spermRaceAbi, bytecode: art.bytecode, args, gas, chain });
console.log(`tx        ${explorerTx(cfg.explorerUrl, hash)}`);
const t0 = performance.now();
const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 100 });
const ms = Math.round(performance.now() - t0);
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`déploiement reverté : ${hash}`);
const address = receipt.contractAddress as Address;

// Relecture : le contrat en place est bien celui qu'on croit.
const [owner, onchainAttestor, threshold] = await Promise.all([
  publicClient.readContract({ address, abi: spermRaceAbi, functionName: "owner" }),
  publicClient.readContract({ address, abi: spermRaceAbi, functionName: "attestor" }),
  publicClient.readContract({ address, abi: spermRaceAbi, functionName: "threshold" }),
]);
if (owner !== account.address || onchainAttestor !== attestor || threshold !== BigInt(cfg.threshold)) {
  throw new Error("relecture incohérente après déploiement");
}

const updates: Record<string, string> = {
  CONTRACT_ADDRESS: address,
  CONTRACT_DEPLOY_BLOCK: receipt.blockNumber.toString(),
};
if (!process.argv.includes("--keep-mode")) updates.CHAIN_MODE = "testnet";
upsertEnv(updates);

console.log(`\nSpermRace déployé en ${ms} ms (reçu), bloc ${receipt.blockNumber}`);
console.log(`  adresse   ${address}`);
console.log(`  explorer  ${explorerAddress(cfg.explorerUrl, address)}`);
console.log(`  gas payé  ${receipt.gasUsed} utilisé / ${gas} facturé (Monad facture le limit)`);
console.log(`  .env.local mis à jour${updates.CHAIN_MODE ? " · CHAIN_MODE=testnet" : ""} — redémarrer le serveur.`);
