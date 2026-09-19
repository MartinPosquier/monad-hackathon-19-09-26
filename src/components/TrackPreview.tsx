"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { RaceResult, RacerEntry } from "@/shared/types";
import { RaceStage } from "./RaceStage";
import { useTicker } from "./hooks";
import { raceTime } from "@/lib/format";

export function TrackPreview({ racers, result }: { racers: RacerEntry[]; result: RaceResult }) {
  const [clock, updateClock] = useState({ base: -3000, at: 0, playing: false });
  const playing = clock.playing;
  useTicker(100);
  const time = useCallback(() => Math.min(result.durationMs + 2500, clock.base + (clock.playing ? performance.now() - clock.at : 0)), [result.durationMs, clock]);
  const setClock = (base: number, play: boolean) => updateClock({ base, at: performance.now(), playing: play });
  const ms = time();
  const done = ms >= result.durationMs + 2500;
  return <main className="track-page">
    <header className="track-header"><Link href="/" className="track-brand">MONAD <span>SPERM RACE</span></Link><span className="track-preview-label">CIRCUIT PREVIEW · NO WALLET NEEDED</span><Link href="/" className="btn small ghost">Join a race ↗</Link></header>
    <div className="track-title"><div><p className="race-eyebrow">THE BEDROOM CIRCUIT</p><h1>One drop. Forty contenders.</h1></div><p>Four bursts. A slide across an unmade bed.<br />From the fire hose to the egg.</p></div>
    <RaceStage replay={result.replay} racers={racers} playerIndex={0} time={time} durationMs={result.durationMs} />
    <div className="preview-controls">
      <button className="btn" onClick={() => setClock(done ? -3000 : ms, done || !playing)}>{done ? "Race again" : playing ? "Pause" : ms < 0 ? "Release the racers" : "Play"}</button>
      <button className="btn ghost" onClick={() => setClock(-3000, false)}>Reset</button>
      <label className="preview-seek">Explore the race<input type="range" aria-label="Replay time" min={0} max={result.durationMs} step={100} value={Math.max(0, Math.min(ms, result.durationMs))} onChange={(e) => setClock(Number(e.target.value), false)} /></label>
      <span className="mono">{raceTime(Math.max(0, Math.min(ms, result.durationMs)))} / {raceTime(result.durationMs)}</span>
    </div>
    {done && <p className="preview-result">Your finish: P{result.ranking.find((r) => r.racerId === 0)!.rank} / {racers.length} · {raceTime(result.ranking.find((r) => r.racerId === 0)!.finishMs)}. Ready for another drop?</p>}
  </main>;
}
