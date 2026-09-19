/** Planck à pas fixe : collisions réelles, gravité tangentielle et impulsion de départ.
 * Le plan incliné est simulé en 2D puis projeté sur la piste 3D par le renderer.
 * Aucun classement tiré au sort : il découle du franchissement de la ligne.
 */
import { World, Vec2, Circle, Edge, Box } from "planck";
import { int16ToBase64 } from "@/shared/replay";
import type { RaceEngine } from "./index";
import { forkRng } from "./prng";
import { surfaceHeight, MAX_RACERS, LAUNCH_WINDOW, FIRST_FINISH_SECONDS, FINISH_SPREAD_SECONDS, FINISH_Y, HEAD_RADIUS, PEGS, RAILS, ROTORS, TRACK_VERSION } from "./track";

const DT = 1 / 60;
const HZ = 30;
const SCALE = 150;

export const planckEngine: RaceEngine = {
  name: "planck",
  simulate({ seed, racers }) {
    if (!racers.length || racers.length > MAX_RACERS) throw new Error("La course exige 1 à 40 participants.");
    if (new Set(racers.map((r) => r.id)).size !== racers.length) throw new Error("Identifiants de participants dupliqués.");
    const world = new World({ gravity: Vec2(0, 0), allowSleep: false });
    const ground = world.createBody();
    for (const r of RAILS) ground.createFixture(new Edge(Vec2(r.ax, r.ay), Vec2(r.bx, r.by)), { friction: 0.02, restitution: 0.35 });
    for (const row of PEGS) for (const p of row) ground.createFixture(new Circle(Vec2(p.x, p.y), p.radius), { friction: 0, restitution: 0.65 });
    for (const r of ROTORS) {
      const rotor = world.createKinematicBody({ position: Vec2(r.x, r.y), angle: r.phase, angularVelocity: r.speed });
      rotor.createFixture(new Box(r.radius, 0.22), { friction: 0.05, restitution: 0.6 });
      rotor.createFixture(new Box(0.22, r.radius), { friction: 0.05, restitution: 0.6 });
    }
    const gridRng = forkRng(seed, "starting-grid");
    const grid = racers.map((_, i) => i);
    for (let i = grid.length - 1; i > 0; i--) { const j = Math.floor(gridRng() * (i + 1)); [grid[i], grid[j]] = [grid[j], grid[i]]; }
    const actors = racers.map((r, index) => {
      const i = grid[index];
      const rng = forkRng(seed, `physics:${r.id}`);
      const body = world.createDynamicBody({ position: Vec2((i % 5 - 2) * 0.7, 2 + Math.floor((i % 10) / 5) * 0.7), active: false, linearDamping: 0.32, bullet: true, fixedRotation: true });
      // Catégorie 2 : aucun contact entre participants, uniquement avec le décor (1).
      body.createFixture(new Circle(HEAD_RADIUS), { density: 1, friction: 0.02, restitution: 0.4, filterCategoryBits: 2, filterMaskBits: 1 });
      return { body, release: Math.floor(i / 10), launched: false, impulseX: (rng() - 0.5) * 4, impulseY: 8 + rng() * 2, finish: 0 };
    });
    const raw: number[][] = [];
    const record = () => raw.push(actors.flatMap((a) => { const p = a.body.getPosition(); return [p.x, p.y]; }));
    record();
    let steps = 0;
    for (steps = 1; steps <= 60 * 150; steps++) {
      const t = steps * DT;
      for (const a of actors) {
        if (a.finish) continue;
        if (!a.launched) {
          if ((steps - 1) * DT < a.release) continue;
          a.launched = true;
          a.body.setActive(true);
          a.body.setLinearVelocity(Vec2(a.impulseX, a.impulseY));
        }
        const p = a.body.getPosition();
        // Accélération tangentielle -g ∇h, réduite par la pente du plan.
        // Aucun objectif de vitesse, oscillation ou pilotage individuel.
        const e = 0.02;
        const gx = (surfaceHeight(p.x + e, p.y) - surfaceHeight(p.x - e, p.y)) / (2 * e);
        const gy = (surfaceHeight(p.x, p.y + e) - surfaceHeight(p.x, p.y - e)) / (2 * e);
        const factor = 24 / (1 + gx * gx + gy * gy);
        const mass = a.body.getMass();
        a.body.applyForceToCenter(Vec2(-mass * factor * gx, -mass * factor * gy));
      }
      world.step(DT, 6, 3);
      for (const a of actors) {
        if (!a.finish && a.body.getPosition().y >= FINISH_Y) {
          a.finish = t;
          a.body.setTransform(Vec2(a.body.getPosition().x, FINISH_Y), 0);
          a.body.setLinearVelocity(Vec2(0, 0));
          a.body.setActive(false); // Les arrivants ne doivent pas boucher la ligne.
        }
      }
      if (steps % 2 === 0) record();
      // Toujours finir sur une frame de 30 Hz : pas de dernier intervalle raccourci.
      if (steps % 2 === 0 && actors.every((a) => a.finish)) break;
    }
    if (actors.some((a) => !a.finish)) throw new Error(`Course bloquée : ${actors.filter((a) => !a.finish).map((a) => JSON.stringify(a.body.getPosition())).join(", ")}`);

    // Une horloge commune à tous les participants règle la durée de spectacle.
    // Jusqu'au premier : 40 s ; ensuite écart conservé, ou comprimé à 12 s maximum.
    // L'ordre, les collisions et les dépassements restent ceux de la simulation.
    const first = Math.min(...actors.map((a) => a.finish));
    const last = Math.max(...actors.map((a) => a.finish));
    const speed = (FIRST_FINISH_SECONDS - LAUNCH_WINDOW) / (first - LAUNCH_WINDOW);
    const tailScale = Math.min(speed, FINISH_SPREAD_SECONDS / Math.max(last - first, 0.001));
    const toReplayTime = (t: number) => t <= LAUNCH_WINDOW ? t : t <= first ? LAUNCH_WINDOW + (t - LAUNCH_WINDOW) * speed : FIRST_FINISH_SECONDS + (t - first) * tailScale;
    const durationMs = Math.round(toReplayTime(last) * 1000);
    const frames = Math.ceil(durationMs / 1000 * HZ) + 1;
    const samples = new Int16Array(frames * racers.length * 2);
    for (let f = 0; f < frames; f++) {
      const time = f / HZ;
      const physical = time <= LAUNCH_WINDOW ? time : time <= FIRST_FINISH_SECONDS ? LAUNCH_WINDOW + (time - LAUNCH_WINDOW) / speed : first + (time - FIRST_FINISH_SECONDS) / tailScale;
      const k = Math.min(physical * HZ, raw.length - 1);
      const low = Math.floor(k), high = Math.min(low + 1, raw.length - 1);
      for (let c = 0; c < racers.length * 2; c++) {
        // Le franchissement peut se situer entre deux frames : dès l'arrivée réelle,
        // conserver exactement la position d'arrivée au lieu d'interpoler en amont.
        const arrived = physical >= actors[Math.floor(c / 2)].finish || f === frames - 1;
        const value = arrived ? raw[raw.length - 1][c] : raw[low][c] + (raw[high][c] - raw[low][c]) * (k - low);
        samples[f * racers.length * 2 + c] = Math.round(value * SCALE);
      }
    }
    return {
      seed, engine: "planck", durationMs,
      ranking: actors.map((a, i) => ({ racerId: racers[i].id, rank: 0, finishMs: Math.round(toReplayTime(a.finish) * 1000) }))
        .sort((a, b) => a.finishMs - b.finishMs || a.racerId - b.racerId).map((r, i) => ({ ...r, rank: i + 1 })),
      replay: { format: "int16-v1", engine: "planck", hz: HZ, frames, racers: racers.length, channels: 2, scale: SCALE,
        data: int16ToBase64(samples), track: TRACK_VERSION, finishTimes: actors.map((a) => Math.round(toReplayTime(a.finish) * 1000)),
        releaseTimes: actors.map((a) => a.release * 1000),
        clock: { firstPhysical: first, firstReplay: FIRST_FINISH_SECONDS, headScale: speed, tailScale, launchWindow: LAUNCH_WINDOW } },
    };
  },
};
