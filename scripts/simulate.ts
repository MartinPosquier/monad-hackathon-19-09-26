/**
 * Joue une course sans UI et imprime le classement.
 *
 *   npm run simulate -- --seed 0xabc            une course
 *   npm run simulate -- --seed 0xabc --check    deux fois le même seed : classements identiques ?
 *   npm run simulate -- --sanity 5              5 seeds aléatoires : invariants du plan
 *   options : --racers 50  --engine stub
 *
 * Avec le moteur stub, seul le nombre de racers compte : le classement d'une vraie course
 * se vérifie donc avec son seed seul.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Hex } from "viem";
import type { RaceResult, RacerEntry } from "../src/shared/types";
import { getEngine } from "../src/sim";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function normalizeSeed(raw: string): Hex {
  const hex = raw.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{1,64}$/.test(hex)) throw new Error(`seed invalide : ${raw}`);
  return `0x${hex.padStart(64, "0")}` as Hex;
}

const count = Number(arg("racers") ?? 50);
const engine = getEngine(arg("engine") ?? "stub");
const racers: RacerEntry[] = Array.from({ length: count }, (_, id) => ({
  id,
  name: `racer-${String(id).padStart(2, "0")}`,
  isBot: true,
  address: null,
  color: "#fff",
  joinTx: null,
}));

const fingerprint = (r: RaceResult) =>
  createHash("sha256").update(JSON.stringify(r.ranking)).update(r.replay.data).digest("hex").slice(0, 16);

function run(seed: Hex) {
  const t0 = performance.now();
  const result = engine.simulate({ seed, racers });
  return { result, cpuMs: Math.round(performance.now() - t0) };
}

function invariants(r: RaceResult): string[] {
  const problems: string[] = [];
  if (r.ranking.length !== count) problems.push(`${r.ranking.length} arrivants sur ${count}`);
  const spread = r.ranking.at(-1)!.finishMs - r.ranking[0].finishMs;
  if (spread >= 20_000) problems.push(`écart premier–dernier ${spread} ms ≥ 20 s`);
  if (r.durationMs < 60_000 || r.durationMs > 90_000) problems.push(`durée ${r.durationMs} ms hors [60 s, 90 s]`);
  return problems;
}

if (arg("sanity")) {
  const n = Number(arg("sanity"));
  let failed = 0;
  for (let i = 0; i < n; i++) {
    const seed = `0x${randomBytes(32).toString("hex")}` as Hex;
    const { result, cpuMs } = run(seed);
    const problems = invariants(result);
    failed += problems.length ? 1 : 0;
    console.log(`${problems.length ? "ÉCHEC" : "ok   "} ${seed.slice(0, 18)}…  ${result.durationMs} ms  cpu ${cpuMs} ms  ${problems.join(" ; ")}`);
  }
  process.exitCode = failed ? 1 : 0;
  process.exit();
}

const seed = normalizeSeed(arg("seed") ?? `0x${randomBytes(32).toString("hex")}`);
const { result, cpuMs } = run(seed);
console.log(`moteur ${engine.name} · seed ${seed}`);
console.log(`${count} racers · course ${result.durationMs} ms · simulée en ${cpuMs} ms · empreinte ${fingerprint(result)}\n`);
for (const e of result.ranking) {
  const gap = e.rank === 1 ? "" : `+${((e.finishMs - result.ranking[0].finishMs) / 1000).toFixed(3)}`;
  console.log(`${String(e.rank).padStart(3)}  ${racers[e.racerId].name}  ${(e.finishMs / 1000).toFixed(3)} s  ${gap}`);
}

if (flag("check")) {
  const again = run(seed).result;
  const same = fingerprint(again) === fingerprint(result);
  console.log(`\ndéterminisme : ${same ? "OK — même classement, même replay" : "ÉCHEC — les deux passes divergent"}`);
  process.exitCode = same ? 0 : 1;
}
