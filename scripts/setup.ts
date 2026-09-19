/**
 * Crée .env.local s'il manque et génère les clés absentes. N'écrase JAMAIS une clé existante.
 *
 *   npm run setup
 *
 * - DEPLOYER_PRIVATE_KEY : owner du contrat, paie le déploiement et les podiums → à alimenter en MON.
 * - ATTESTOR_PRIVATE_KEY : signe les attestations EIP-712, ne paie jamais rien → jamais de MON.
 * - HOST_TOKEN          : ouvre le bouton « Start now » via http://localhost:3100/?host=<jeton>.
 */
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { ENV_FILE, loadEnv, upsertEnv } from "./env";

const TEMPLATE = `# Monad Sperm Race — configuration locale. Contient des clés : jamais commitée.

# stub = aucun réseau (démo hors ligne) · testnet = contrat réel sur Monad
CHAIN_MODE=stub
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
EXPLORER_URL=https://testnet.monadvision.com

# Seuil de qualification passé au constructeur. Ensuite : npm run threshold -- 1000
QUALIFY_THRESHOLD=5

LOBBY_SECONDS=45
PRESTART_SECONDS=6
RACE_SIZE=50
RACE_ENGINE=stub
SUBMIT_RESULTS=1

CONTRACT_ADDRESS=
`;

if (!existsSync(ENV_FILE)) writeFileSync(ENV_FILE, TEMPLATE);
const cfg = loadEnv();
const created: string[] = [];

if (!cfg.deployerKey) {
  upsertEnv({ DEPLOYER_PRIVATE_KEY: generatePrivateKey() });
  created.push("DEPLOYER_PRIVATE_KEY");
}
if (!cfg.attestorKey) {
  upsertEnv({ ATTESTOR_PRIVATE_KEY: generatePrivateKey() });
  created.push("ATTESTOR_PRIVATE_KEY");
}
if (!cfg.hostToken) {
  upsertEnv({ HOST_TOKEN: randomBytes(12).toString("hex") });
  created.push("HOST_TOKEN");
}

const deployer = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex).address;
const attestor = privateKeyToAccount(process.env.ATTESTOR_PRIVATE_KEY as Hex).address;

console.log(created.length ? `Généré : ${created.join(", ")}` : "Rien à générer : toutes les clés existent déjà.");
console.log(`\n  Deployer (owner, à alimenter) : ${deployer}`);
console.log(`  Attestor (signature seule)    : ${attestor}`);
console.log(`  Lien hôte                     : http://localhost:3100/?host=${process.env.HOST_TOKEN}`);
console.log(`\nEnvoie ~2 MON testnet au deployer, puis : npm run deploy`);
