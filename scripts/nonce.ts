/**
 * Équivalent de `cast nonce` : le compteur de tx d'une adresse, tel que l'attestation le lit.
 * À recouper avec l'explorer pour valider la lecture du nonce (vérification n° 3 du plan).
 *
 *   npm run nonce -- 0xAdresse
 */
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { explorerAddress, monadTestnet } from "../src/shared/chain";
import { loadEnv } from "./env";

const raw = process.argv[2];
if (!raw || !isAddress(raw)) throw new Error("usage : npm run nonce -- 0xAdresse");
const address = getAddress(raw);
const cfg = loadEnv();
const client = createPublicClient({ chain: monadTestnet(cfg.rpcUrl, cfg.explorerUrl), transport: http(cfg.rpcUrl) });

const [latest, pending, block] = await Promise.all([
  client.getTransactionCount({ address, blockTag: "latest" }),
  client.getTransactionCount({ address, blockTag: "pending" }),
  client.getBlockNumber(),
]);
console.log(`adresse  ${address}`);
console.log(`nonce    ${latest} (latest) · ${pending} (pending) · bloc ${block}`);
console.log(`seuil    ${cfg.threshold} → ${latest >= cfg.threshold ? "qualifiée" : "pas encore qualifiée"}`);
console.log(`explorer ${explorerAddress(cfg.explorerUrl, address)}`);
