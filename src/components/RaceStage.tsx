"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ReplayReader } from "@/shared/replay";
import type { RacerEntry, ReplayData } from "@/shared/types";
import { finishTimes, position, standings } from "@/game/replay";
import type { CameraMode, SceneFrame } from "@/game/scene";
import { FINISH_Y, stageAt, STAGES } from "@/sim/track";
import { raceTime } from "@/lib/format";
import { useTicker } from "./hooks";

interface Props { replay: ReplayData; racers: RacerEntry[]; playerIndex: number; time: () => number; durationMs: number }

export function RaceStage({ replay, racers, playerIndex, time, durationMs }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<CameraMode>("follow");
  const [selected, setSelected] = useState<number | null>(null);
  const reader = useMemo(() => new ReplayReader(replay), [replay]);
  const finishes = useMemo(() => finishTimes(reader), [reader]);
  useTicker(100);
  const ms = time();
  const order = standings(reader, ms, finishes);
  const followed = selected ?? (playerIndex >= 0 ? playerIndex : order[0].index);
  const place = order.findIndex((r) => r.index === followed) + 1;
  const racer = racers[followed];
  const y = position(reader, followed, ms)[1];
  const stage = stageAt(y);
  const finished = ms >= finishes[followed];
  const releaseAt = replay.releaseTimes?.[followed] ?? 0;
  const waiting = ms >= 0 && ms < releaseAt;
  const frameRef = useRef<() => SceneFrame>(() => ({ ms: 0, follow: 0, mode: "follow" }));
  useEffect(() => { frameRef.current = () => ({ ms: time(), follow: followed, mode }); }, [time, followed, mode]);

  useEffect(() => {
    let stopped = false;
    let dispose: (() => void) | undefined;
    import("@/game/scene").then(async ({ createRaceScene }) => {
      if (stopped || !canvas.current) return;
      try {
        const cleanup = await createRaceScene(canvas.current, reader, racers, () => frameRef.current(), setError);
        if (stopped) { cleanup(); return; }
        dispose = cleanup;
        setError(null);
        setReady(true);
      } catch {
        setError("Your browser could not start 3D. Enable hardware acceleration or try a recent browser.");
      }
    }).catch(() => { if (!stopped) setError("The 3D scene could not load. Reload the page to try again."); });
    return () => { stopped = true; dispose?.(); };
  }, [reader, racers]);

  const fullScreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch { /* Le navigateur peut refuser le plein écran, la course reste accessible. */ }
  };

  return <div className="race-theater" ref={container}>
    <div className="race-toolbar">
      <div className="race-following"><span className="dot" style={{ background: racer.color }} /><span>{playerIndex === followed ? "Following you" : "Following"} <strong>{racer.name}</strong></span></div>
      <div className="race-actions">
        <button className={mode === "follow" ? "active" : ""} aria-pressed={mode === "follow"} onClick={() => setMode("follow")}>Follow</button>
        <button className={mode === "overview" ? "active" : ""} aria-pressed={mode === "overview"} onClick={() => setMode("overview")}>Full track</button>
        <button onClick={() => void fullScreen()} aria-label="Toggle fullscreen">⛶</button>
      </div>
    </div>
    <div className="race-viewport">
      <canvas ref={canvas} aria-label={`3D race. Following ${racer.name}, position ${place} of ${racers.length}.`} />
      <div className="race-hud">
        <div><span className="race-eyebrow">{finished ? "FINISHED" : ms < 0 ? "ON THE GRID" : waiting ? "WAITING FOR YOUR BURST" : stage.name.toUpperCase()}</span><strong>{finished ? raceTime(finishes[followed]) : raceTime(Math.max(0, Math.min(ms, durationMs)))}</strong></div>
        <div className="race-position"><strong>P{place}</strong><span>/ {racers.length}</span></div>
      </div>
      <aside className="race-classification" aria-label="Race standings">
        <span className="race-eyebrow">LIVE ORDER</span>
        {order.slice(0, 5).map((entry, i) => <button key={entry.index} className={entry.index === followed ? "chosen" : ""} onClick={() => setSelected(entry.index)}>
          <span>{i + 1}</span><i style={{ background: racers[entry.index].color }} /><span>{racers[entry.index].name}</span><small>{entry.finish !== null ? "✓" : racers[entry.index].isBot ? "BOT" : ""}</small>
        </button>)}
        {place > 5 && <div className="race-own-position"><b>{place}</b><span>{racer.name}</span></div>}
      </aside>
      {(error || !ready) && <div className="race-cover" role={error ? "alert" : "status"}><strong>{error ? "3D unavailable" : "Preparing the track"}</strong><span>{error ?? "Loading the course and its racers…"}</span></div>}
      {ready && !error && ms < 0 && <div className="race-countdown" aria-live="polite"><strong>{Math.ceil(-ms / 1000)}</strong><span>READY TO DROP</span></div>}
      {ready && !error && waiting && <div className="race-countdown"><strong>{Math.ceil((releaseAt - ms) / 1000)}</strong><span>YOUR BURST · {Math.floor(releaseAt / 1000) + 1} / {Math.ceil(racers.length / 10)}</span></div>}
      {ready && !error && finished && <div className="race-finish-note"><span>{playerIndex === followed ? "YOUR FINISH" : "FINISHED"}</span><strong>P{place} <small>· {raceTime(finishes[followed])}</small></strong></div>}
      <div className="race-camera-label">{mode === "overview" ? "COURSE OVERVIEW" : finished ? "FINISH CAMERA" : "THIRD-PERSON CAMERA"}</div>
    </div>
    <div className="race-route" aria-label="Course stages">
      {STAGES.map((s, i) => <div key={s.name} className={stage === s ? "current" : y >= s.to ? "passed" : ""}><span>{String(i + 1).padStart(2, "0")}</span>{s.name}</div>)}
      <div className="race-route-progress" style={{ width: `${Math.min(100, Math.max(0, y / FINISH_Y * 100))}%` }} />
    </div>
    <div className="race-footer">
      <span>{replay.releaseTimes ? "10 racers per burst · 1 second apart · first across the line wins" : playerIndex >= 0 ? "Your racer moves automatically. Enjoy the ride." : "A spectator race. Pick a racer to follow."}</span>
      <label>Camera target <select aria-label="Camera target" value={selected ?? "auto"} onChange={(e) => setSelected(e.target.value === "auto" ? null : Number(e.target.value))}>
        <option value="auto">{playerIndex >= 0 ? "My racer" : "Race leader"}</option>
        {racers.map((r, i) => <option key={r.id} value={i}>{r.name}{r.isBot ? " · BOT" : ""}</option>)}
      </select></label>
    </div>
  </div>;
}
