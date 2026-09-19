/**
 * Solde du deployer. Code de sortie 0 s'il couvre un déploiement, 2 sinon :
 * la boucle autonome s'en sert pour savoir quand déployer.
 *
 *   npm run balance
 */
import { formatEther, parseEther } from "viem";
import { clients } from "./env";

/** Déploiement ≈ 0,07 MON à 102 gwei, plus une réserve pour les podiums de la démo. */
export const MIN_BALANCE = parseEther("0.3");

const { account, publicClient, cfg } = clients();
const [balance, nonce, gasPrice] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.getTransactionCount({ address: account.address }),
  publicClient.getGasPrice(),
]);

console.log(`deployer  ${account.address}`);
console.log(`solde     ${formatEther(balance)} MON`);
console.log(`nonce     ${nonce}`);
console.log(`gas       ${Number(gasPrice) / 1e9} gwei`);
console.log(`contrat   ${cfg.contract ?? "non déployé"}`);
console.log(balance >= MIN_BALANCE ? "→ suffisant pour déployer" : `→ insuffisant (minimum ${formatEther(MIN_BALANCE)} MON)`);
// exitCode plutôt que process.exit() : sous Windows, couper une socket HTTP ouverte fait planter libuv.
process.exitCode = balance >= MIN_BALANCE ? 0 : 2;
