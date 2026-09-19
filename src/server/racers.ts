/** Identité visuelle des racers : couleurs uniques et noms de bots. */
import type { Address } from "viem";
import { shortAddress } from "@/shared/chain";
import { forkRng } from "@/sim/prng";

/** Angle d'or : 50 teintes voisines restent toutes distinguables. */
export function racerColor(id: number): string {
  const hue = Math.round((id * 137.508 + 265) % 360);
  return `hsl(${hue} 85% 64%)`;
}

const BOT_NAMES = [
  "Swimmy", "Flagella", "Tailspin", "Wiggles", "Torpedo", "Squiggles", "Noodle", "Zippy", "Turbo",
  "Comet", "Dash", "Rocket", "Bolt", "Nitro", "Sprint", "Slippy", "Flash", "Blitz", "Darter",
  "Swirl", "Spiral", "Whiplash", "Glide", "Drift", "Surge", "Ripple", "Wave", "Jet", "Flick",
  "Scoot", "Hustle", "Rush", "Streak", "Zoom", "Whizz", "Vroom", "Swish", "Twirl", "Loop",
  "Kicker", "Pulse", "Fizz", "Spark", "Blip", "Quark", "Photon", "Ion", "Nova", "Meteor", "Zigzag",
];

/** Noms de bots tirés du seed : la course est rejouable à l'identique, bots compris. */
export function botNames(seed: string, count: number): string[] {
  const rng = forkRng(seed, "bots");
  const pool = [...BOT_NAMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

/** Pseudo choisi par le joueur, nettoyé ; à défaut, son adresse abrégée. */
export function playerName(raw: unknown, address: Address): string {
  const clean = typeof raw === "string" ? raw.replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 16) : "";
  return clean || shortAddress(address);
}
