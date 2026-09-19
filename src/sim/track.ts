import course from "./generated/course.json";

/** Coordonnées de course : x = décalage transversal, y = distance sur le modèle OBJ. */
export const TRACK_VERSION = course.version;
export const MAX_RACERS = 40;
export const LAUNCH_WINDOW = 4;
export const FIRST_FINISH_SECONDS = 40;
export const FINISH_SPREAD_SECONDS = 12;
export const FINISH_Y = course.finish;
export const HEAD_RADIUS = 0.18;
export const TRACK_HALF_WIDTH = 3.4;
export const STAGES = course.sections;
export const stageAt = (s: number) => STAGES.find((v) => s < v.to) ?? STAGES.at(-1)!;
export const PEGS = [course.pins];
export const ROTORS = [course.rotor];
export const launchHeight = (age: number) => age < 0 ? 0 : Math.max(0, 0.15 + age - 4.905 * age * age);
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Interpolation des 1 100 sections transversales du véritable maillage du toboggan. */
export function trackFrame(s: number) {
  const points = course.points;
  s = clamp(s, 0, FINISH_Y);
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid].s <= s) lo = mid; else hi = mid; }
  const a = points[lo], b = points[hi], t = clamp((s - a.s) / (b.s - a.s), 0, 1);
  const p = a.p.map((v, i) => v + (b.p[i] - v) * t);
  const right = a.right.map((v, i) => v + (b.right[i] - v) * t);
  const length = Math.hypot(...right); return { p, right: right.map((v) => v / length) };
}
export function trackPoint(lane: number, s: number, lift = 0): [number, number, number] {
  const { p, right } = trackFrame(s);
  return [p[0] + lane * right[0], p[1] + lane * right[1] + lift, p[2] + lane * right[2]];
}
export const surfaceHeight = (lane: number, s: number) => trackPoint(lane, s)[1];

export interface Rail { ax: number; ay: number; bx: number; by: number; kind: "wall" }
const mill = course.sections[3];
export const RAILS: Rail[] = [-1, 1].flatMap((side) => [
  { ax: side * 3.4, ay: 0, bx: side * 3.4, by: mill.from, kind: "wall" as const },
  { ax: side * 3.4, ay: mill.to, bx: side * 3.4, by: FINISH_Y + 1, kind: "wall" as const },
  ...Array.from({ length: 32 }, (_, i) => {
    const y1 = mill.from + (mill.to - mill.from) * i / 32;
    const y2 = mill.from + (mill.to - mill.from) * (i + 1) / 32;
    const width = (y: number) => Math.max(3.4, Math.sqrt(Math.max(0, 8.7 ** 2 - (y - course.rotor.y) ** 2)));
    return { ax: side * width(y1), ay: y1, bx: side * width(y2), by: y2, kind: "wall" as const };
  }),
]);

