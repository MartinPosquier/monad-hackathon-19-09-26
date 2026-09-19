"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { raceCode, sameAddress } from "@/lib/format";
import type { RaceDetail } from "@/shared/types";
import { RaceStage } from "./RaceStage";

interface Props { raceId: string; serverNow: () => number; address: string | null; onLeave: () => void }

export function RaceView({ raceId, serverNow, address, onLeave }: Props) {
  const [race, setRace] = useState<RaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const load = async () => {
      try {
        const r = await api<RaceDetail>(`/api/race/${raceId}`);
        if (stop) return;
        setRace(r); setError(null);
        if (!r.replay) timer = setTimeout(load, 500);
      } catch (e) {
        if (stop) return;
        if (++attempts < 4) timer = setTimeout(load, 1000);
        else setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    return () => { stop = true; clearTimeout(timer); };
  }, [raceId]);
  const time = useCallback(() => race?.startAt ? serverNow() - race.startAt : -6000, [race, serverNow]);
  return <section aria-label={`Race ${raceCode(raceId)}`}>
    <div className="race-top"><div><h2 className="section-title" style={{ margin: 0 }}>Race {raceCode(raceId)}</h2><span className="muted">Cascade circuit · {race?.racers.length ?? 40} racers</span></div><button className="btn small ghost" onClick={onLeave}>Back to lobby</button></div>
    {error ? <p className="error-line" role="alert">{error}</p> : race?.replay ? <RaceStage key={raceId} replay={race.replay} racers={race.racers} playerIndex={race.racers.findIndex((r) => sameAddress(r.address, address))} time={time} durationMs={race.durationMs!} /> : <div className="boot">Preparing the race…</div>}
  </section>;
}
