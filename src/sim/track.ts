/** Géométrie commune à la physique et au rendu : x transversal, y dans la descente. */
export const TRACK_VERSION = "bed-slide-v3";
export const FIRST_FINISH_SECONDS = 40;
export const FINISH_SPREAD_SECONDS = 12;
export const MAX_RACERS = 40;
export const LAUNCH_WINDOW = 4;
/** Hauteur balistique au-dessus du toboggan, après l'impulsion de la lance. */
export const launchHeight = (age: number) => age < 0 ? 0 : Math.max(0, 2 + 4 * age - 4.905 * age * age);
export const FINISH_Y = 171;
export const HEAD_RADIUS = 0.3;
export const TRACK_HALF_WIDTH = 11;
export const STAGES = [
  { name: "Launch", from: 0, to: 15 },
  { name: "Whirlpool", from: 15, to: 41 },
  { name: "Galton board", from: 41, to: 66 },
  { name: "The ladder", from: 66, to: 104 },
  { name: "Rotating gates", from: 104, to: 135 },
  { name: "Split funnel", from: 135, to: 157 },
  { name: "Final sprint", from: 157, to: FINISH_Y },
] as const;
export const stageAt = (y: number) => STAGES.find((s) => y < s.to) ?? STAGES.at(-1)!;
export interface Rail { ax: number; ay: number; bx: number; by: number; kind: "wall" | "ladder" | "divider" }
export const RAILS: Rail[] = [
  { ax: -11, ay: 0, bx: -11, by: FINISH_Y + 7, kind: "wall" },
  { ax: 11, ay: 0, bx: 11, by: FINISH_Y + 7, kind: "wall" },
  { ax: -3.3, ay: 0, bx: -3.3, by: 12, kind: "wall" },
  { ax: 3.3, ay: 0, bx: 3.3, by: 12, kind: "wall" },
  ...Array.from({ length: 5 }, (_, i): Rail => {
    const side = i % 2 === 0 ? 1 : -1;
    return { ax: -side * 10.9, ay: 67 + i * 7, bx: side * 5.8, by: 72 + i * 7, kind: "ladder" };
  }),
  { ax: -11, ay: 137, bx: -3.8, by: 152, kind: "divider" },
  { ax: 11, ay: 137, bx: 3.8, by: 152, kind: "divider" },
  { ax: 0, ay: 139, bx: 0, by: 151, kind: "divider" },
];
export const PEGS = Array.from({ length: 6 }, (_, row) => {
  const count = Math.min(3 + row, 8);
  return Array.from({ length: count }, (_, col) => ({
    x: (col - (count - 1) / 2) * 2.55 + (row > 5 && row % 2 ? 0.55 : 0),
    y: 46 + row * 2.8,
    radius: 0.5,
  }));
});
export const ROTORS = [
  { x: -4, y: 111, radius: 4.3, speed: 0.75, phase: 0 },
  { x: 4, y: 123, radius: 4.3, speed: -0.85, phase: 0.7 },
];

/** Surface inclinée, avec bassin creusé et marches arrondies sous les barreaux. */
export function surfaceHeight(x: number, y: number): number {
  let height = 58 - y * 0.27;
  const r = Math.hypot(x, y - 27);
  if (r < 11) height -= 1.3 * (1 - r / 11) ** 2;
  // Profil en auge : la gravité ramène naturellement vers le fond du toboggan.
  height += 0.002 * x * x;
  if (y > 66 && y < 104) height += 0.12 * Math.sin((y - 66) / 7 * Math.PI * 2);
  return height;
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
