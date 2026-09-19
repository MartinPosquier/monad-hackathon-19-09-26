/**
 * Lecture et mise à jour de .env.local pour les scripts (hors Next.js).
 * Les clés privées ne sont jamais imprimées : seules les adresses le sont.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../src/shared/chain";
import { serverConfig } from "../src/server/config";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ENV_FILE = join(ROOT, ".env.local");

export function loadEnv() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  return serverConfig();
}

/** Remplace (ou ajoute) des clés dans .env.local en gardant commentaires et ordre. */
export function upsertEnv(values: Record<string, string>) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
    process.env[k] = v;
  }
  writeFileSync(ENV_FILE, text);
}

export function clients() {
  const cfg = loadEnv();
  if (!cfg.deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY absente : lancer `npm run setup` d'abord.");
  const chain = monadTestnet(cfg.rpcUrl, cfg.explorerUrl);
  const account = privateKeyToAccount(cfg.deployerKey as Hex);
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as PublicClient;
  const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
  return { cfg, chain, account, publicClient, wallet };
}
