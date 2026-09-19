/**
 * Compile contracts/SpermRace.sol avec le paquet npm `solc` (pas de Foundry).
 *
 * Sorties :
 *   artifacts/SpermRace.json          ABI + bytecode + métadonnées de compilation
 *   src/lib/contract/spermRace.ts     ABI typée `as const` pour viem, importée par le front et le serveur
 *
 *   npm run compile
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "SpermRace.sol";
// Monad supporte tous les opcodes jusqu'à Fusaka ; prague est un sous-ensemble sûr.
const EVM_VERSION = "prague";

export function compileSpermRace() {
  const input = {
    language: "Solidity",
    sources: { [SOURCE]: { content: readFileSync(join(ROOT, "contracts", SOURCE), "utf8") } },
    settings: {
      evmVersion: EVM_VERSION,
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errors.length) {
    throw new Error(errors.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n"));
  }
  for (const w of output.errors ?? []) console.warn(w.formattedMessage);

  const c = output.contracts[SOURCE].SpermRace;
  return {
    abi: c.abi,
    bytecode: `0x${c.evm.bytecode.object}` as `0x${string}`,
    deployedSize: c.evm.deployedBytecode.object.length / 2,
    compiler: solc.version() as string,
    evmVersion: EVM_VERSION,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const art = compileSpermRace();
  mkdirSync(join(ROOT, "artifacts"), { recursive: true });
  writeFileSync(join(ROOT, "artifacts", "SpermRace.json"), JSON.stringify(art, null, 2) + "\n");

  const ts =
    `// Généré par scripts/compile.ts — ne pas éditer à la main.\n` +
    `// solc ${art.compiler} · evm ${art.evmVersion}\n\n` +
    `export const spermRaceAbi = ${JSON.stringify(art.abi, null, 2)} as const;\n\n` +
    `export const spermRaceBytecode = "${art.bytecode}" as const;\n`;
  const out = join(ROOT, "src", "lib", "contract", "spermRace.ts");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, ts);

  console.log(`SpermRace compilé — solc ${art.compiler}, evm ${art.evmVersion}`);
  console.log(`  runtime : ${art.deployedSize} octets (limite Monad : 128 Ko)`);
  console.log(`  → artifacts/SpermRace.json, src/lib/contract/spermRace.ts`);
}
