"use client";

/**
 * Vue de course PROVISOIRE. Elle lit le replay produit par le serveur et le rejoue en 2D :
 * de quoi faire tourner et démontrer toute la boucle avant que la scène Three.js existe.
 *
 * La scène 3D (src/game/scene.ts, camera.ts, replay.ts du plan) remplacera le <canvas>
 * de ce composant en lisant exactement les mêmes données (RaceDetail.replay).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { raceCode, raceTime, sameAddress } from "@/lib/format";
import { ReplayReader } from "@/shared/replay";
import type { RaceDetail } from "@/shared/types";
import { useTicker } from "./hooks";

interface Props {
  raceId: string;
  serverNow: () => number;
  address: string | null;
  onLeave: () => void;
}

interface Standing {
  id: number;
  progress: number;
  finishMs: number | null;
}

export function RaceView({ raceId, serverNow, address, onLeave }: Props) {
  const [race, setRace] = useState<RaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useTicker(200);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await api<RaceDetail>(`/api/race/${raceId}`);
        if (stop) return;
        setRace(r);
        if (!r.replay) setTimeout(load, 500);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    return () => {
      stop = true;
    };
  }, [raceId]);

  const replay = race?.replay ?? null;
  const reader = useMemo(() => (replay ? new ReplayReader(replay) : null), [replay]);

  // Instant d'arrivée de chaque racer, lu dans le replay (première frame à 100 %).
  const finishes = useMemo(() => {
    if (!reader) return [];
    const { frames, racers, hz, scale } = reader.replay;
    return Array.from({ length: racers }, (_, i) => {
      for (let f = 0; f < frames; f++) {
        if (reader.samples[f * racers + i] >= scale) return (f / hz) * 1000;
      }
      return null;
    });
  }, [reader]);

  const myId = race?.racers.find((r) => sameAddress(r.address, address))?.id ?? null;
  const t = race?.startAt ? serverNow() - race.startAt : -Infinity;

  // ─── Dessin ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !reader || !race) return;
    const ctx = canvas.getContext("2d")!;
    const n = reader.replay.racers;
    const lanes = Array.from({ length: n }, (_, i) => (i * 17) % n);
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const now = serverNow() - race.startAt!;
      const tt = Math.max(0, now);
      ctx.clearRect(0, 0, w, h);

      // Chenal : parois douces en haut et en bas.
      const wall = ctx.createLinearGradient(0, 0, 0, h);
      wall.addColorStop(0, "rgba(131,110,249,0.10)");
      wall.addColorStop(0.18, "rgba(131,110,249,0)");
      wall.addColorStop(0.82, "rgba(131,110,249,0)");
      wall.addColorStop(1, "rgba(131,110,249,0.10)");
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, w, h);

      // Graduations de distance, façon lame de microscope.
      ctx.strokeStyle = "rgba(237,233,255,0.05)";
      ctx.lineWidth = 1;
      for (let k = 1; k < 10; k++) {
        const x = 40 + ((w - 200) * k) / 10;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.08);
        ctx.lineTo(x, h * 0.92);
        ctx.stroke();
      }

      // Portail d'arrivée.
      const cx = w - 70;
      const cy = h / 2;
      const r = Math.min(h * 0.26, 90);
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6);
      glow.addColorStop(0, "rgba(131,110,249,0.55)");
      glow.addColorStop(0.6, "rgba(131,110,249,0.12)");
      glow.addColorStop(1, "rgba(131,110,249,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(237,233,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      const x0 = 40;
      const x1 = cx - r * 0.55;
      const order = myId === null ? [...Array(n).keys()] : [...Array(n).keys()].filter((i) => i !== myId).concat(myId);
      for (const i of order) {
        const p = reader.value(i, 0, tt);
        const laneY = h * 0.12 + (lanes[i] / Math.max(n - 1, 1)) * h * 0.76;
        const funnel = Math.pow(p, 3) * 0.9;
        const y = laneY + (cy - laneY) * funnel + Math.sin(tt * 0.004 + i * 1.7) * 3 * (1 - p);
        const x = x0 + (x1 - x0) * p;
        const color = race.racers[i]?.color ?? "#836ef9";
        const done = p >= 1;
        const mine = i === myId;
        ctx.globalAlpha = done ? 0.35 : mine ? 1 : 0.85;

        // Queue ondulée.
        ctx.strokeStyle = color;
        ctx.lineWidth = mine ? 2.2 : 1.4;
        ctx.beginPath();
        for (let k = 0; k <= 7; k++) {
          const tx = x - 5 - k * (mine ? 3.4 : 2.6);
          const ty = y + Math.sin(tt * 0.02 + i - k * 0.9) * k * 0.55;
          if (k === 0) ctx.moveTo(tx, ty);
          else ctx.lineTo(tx, ty);
        }
        ctx.stroke();

        // Tête.
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y, mine ? 6.5 : 4.5, mine ? 5 : 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        if (mine) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#ede9ff";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#ede9ff";
          ctx.font = "600 11px system-ui, sans-serif";
          ctx.fillText("YOU", x - 11, y - 16);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reader, race, myId, serverNow]);

  // ─── Classement en direct ───────────────────────────────────────────────
  const standings: Standing[] = useMemo(() => {
    if (!reader) return [];
    const tt = Math.max(0, t);
    return Array.from({ length: reader.replay.racers }, (_, i) => ({
      id: i,
      progress: reader.value(i, 0, tt),
      finishMs: finishes[i] !== null && finishes[i]! <= tt ? finishes[i] : null,
    })).sort((a, b) => {
      if (a.finishMs !== null && b.finishMs !== null) return a.finishMs - b.finishMs;
      if (a.finishMs !== null) return -1;
      if (b.finishMs !== null) return 1;
      return b.progress - a.progress;
    });
    // `t` avance à chaque tick de 200 ms : le classement suit.
  }, [reader, finishes, t]);

  if (error) {
    return (
      <section className="panel">
        <p className="error-line">{error}</p>
        <button className="btn ghost" onClick={onLeave}>
          Back to lobby
        </button>
      </section>
    );
  }

  const size = race?.racers.length ?? 0;
  const myPos = myId === null ? null : standings.findIndex((s) => s.id === myId) + 1;
  const top = standings.slice(0, 10);
  const meOutside = myId !== null && myPos !== null && myPos > 10;
  const over = race?.durationMs != null && t > race.durationMs;

  return (
    <section aria-label={`Race ${raceCode(raceId)}`}>
      <div className="race-top">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            Race {raceCode(raceId)}
          </h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {size} racers · seed <span className="mono">{race?.seed?.slice(0, 10)}…</span>
          </span>
        </div>
        <button className="btn small ghost" onClick={onLeave}>
          Back to lobby
        </button>
      </div>

      <div className="race">
        <div className="stage">
          <canvas ref={canvasRef} aria-label="Race replay" />
          <div className="hud">
            <span className="clock-t">{raceTime(Math.max(0, Math.min(t, race?.durationMs ?? 0)))}</span>
            {myPos ? (
              <span className="pos">
                P{myPos} <small>/ {size}</small>
              </span>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>
                Spectating
              </span>
            )}
          </div>
          {race?.startAt && t < 0 && (
            <div className="overlay-count" aria-live="assertive">
              <div>
                {Math.max(1, Math.ceil(-t / 1000))}
                <span className="sub">Get ready</span>
              </div>
            </div>
          )}
          {!race?.replay && (
            <div className="overlay-count" style={{ fontSize: 22 }}>
              <div>
                Loading the race
                <span className="sub">Fetching the recorded trajectories</span>
              </div>
            </div>
          )}
          {over && (
            <div className="overlay-count" style={{ fontSize: 22 }}>
              <div>
                Everyone&apos;s in
                <span className="sub">Official results in a second</span>
              </div>
            </div>
          )}
          <span className="placeholder-tag">2D placeholder · the 3D race engine plugs in here</span>
        </div>

        <aside className="tower" aria-label="Live standings">
          <h3>Standings</h3>
          <ol>
            {top.map((s, idx) => (
              <TowerRow key={s.id} pos={idx + 1} s={s} race={race} me={s.id === myId} />
            ))}
            {meOutside && (
              <>
                <li className="gap">⋯</li>
                <TowerRow pos={myPos!} s={standings[myPos! - 1]} race={race} me />
              </>
            )}
          </ol>
        </aside>
      </div>
    </section>
  );
}

function TowerRow({ pos, s, race, me }: { pos: number; s: Standing; race: RaceDetail | null; me: boolean }) {
  const r = race?.racers[s.id];
  return (
    <li className={me ? "me" : ""}>
      <span className="p">{pos}</span>
      <span className="dot" style={{ background: r?.color }} />
      <span className="nm">
        {r?.name}
        {r?.isBot && <span className="tag-bot">BOT</span>}
        {me && <span className="tag-you">YOU</span>}
      </span>
      {/* Le replay est échantillonné à 10–30 Hz : le temps officiel, au ms près, est sur l'écran de résultats. */}
      {s.finishMs !== null && (
        <span className="fin" title="Finished">
          ✓
        </span>
      )}
    </li>
  );
}
