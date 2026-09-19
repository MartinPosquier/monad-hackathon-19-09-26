/**
 * Vérification n° 4 du plan : Monad facture-t-il le gas LIMIT ou le gas UTILISÉ ?
 *
 * Envoie depuis le deployer un transfert de 0 MON à lui-même (21 000 de gas nécessaires)
 * avec un limit volontairement 5× trop grand, puis compare le débit réel aux deux hypothèses.
 * Coût : ~0,01 MON.
 *
 *   npm run verify:fees
 */
import { formatEther } from "viem";
import { explorerTx } from "../src/shared/chain";
import { clients } from "./env";

const LIMIT = 105_000n;
const { cfg, account, publicClient, wallet, chain } = clients();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const before = await publicClient.getBalance({ address: account.address });
const hash = await wallet.sendTransaction({ to: account.address, value: 0n, gas: LIMIT, chain });
const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 100 });

// Le solde « latest » peut suivre le reçu de quelques centaines de ms.
let after = before;
for (let i = 0; i < 20 && after === before; i++) {
  after = await publicClient.getBalance({ address: account.address });
  if (after === before) await sleep(300);
}

const debit = before - after;
const price = receipt.effectiveGasPrice;
const ifUsed = receipt.gasUsed * price;
const ifLimit = LIMIT * price;

console.log(`tx           ${explorerTx(cfg.explorerUrl, hash)}`);
console.log(`gas          utilisé ${receipt.gasUsed} · limit ${LIMIT} · prix ${Number(price) / 1e9} gwei`);
console.log(`débit réel   ${formatEther(debit)} MON`);
console.log(`si « used »  ${formatEther(ifUsed)} MON`);
console.log(`si « limit » ${formatEther(ifLimit)} MON`);
const verdict =
  debit === ifLimit
    ? "Monad facture le gas LIMIT → la marge estimateGas × 1,075 est le bon choix."
    : debit === ifUsed
      ? "Monad facture le gas UTILISÉ sur ce RPC → à signaler, contraire à la documentation."
      : "Débit inattendu (autre tx concurrente du deployer ?) → relancer.";
console.log(`\n${verdict}`);
