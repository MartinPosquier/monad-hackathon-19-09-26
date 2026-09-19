"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { gap, raceCode, raceTime, sameAddress } from "@/lib/format";
import { explorerTx } from "@/shared/chain";
import type { AppConfig, RaceDetail } from "@/shared/types";

interface Props {
  raceId: string;
  config: AppConfig;
  address: string | null;
  onClose: () => void;
}

/** Écran de fin : podium, place du joueur, classement complet, preuve on-chain. */
export function Results({ raceId, config, address, onClose }: Props) {
  const [race, setRace] = useState<RaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le classement arrive à `finished`, la tx du podium quelques secondes après : on relit
  // jusqu'à l'avoir (ou jusqu'à ce qu'il soit clair qu'elle ne viendra pas).
  useEffect(() => {
    let stop = false;
    let tries = 0;
    const load = async () => {
      try {
        const r = await api<RaceDetail>(`/api/race/${raceId}`);
        if (stop) return;
        setRace(r);
        const waitingTx = config.mode === "testnet" && config.submitResults && !r.submitTx && !r.submitError;
        if ((!r.ranking || waitingTx) && tries++ < 30) setTimeout(load, 1500);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    return () => {
      stop = true;
    };
  }, [raceId, config.mode, config.submitResults]);

  if (error || (race && !race.ranking && race.status !== "finished")) {
    return (
      <section className="panel">
        <h2>Race {raceCode(raceId)}</h2>
        <p className="error-line">{error ?? "This race has no results yet."}</p>
        <button className="btn ghost" onClick={onClose}>
          Back to lobby
        </button>
      </section>
    );
  }
  if (!race?.ranking) return <div className="boot">Loading results…</div>;

  const byId = new Map(race.racers.map((r) => [r.id, r]));
  const winnerMs = race.ranking[0].finishMs;
  const mine = race.ranking.find((e) => sameAddress(byId.get(e.racerId)?.address, address));
  const podium = [race.ranking[1], race.ranking[0], race.ranking[2]].filter(Boolean);
  const humanCount = race.racers.filter((r) => !r.isBot).length;

  return (
    <section aria-labelledby="results-title">
      <div className="race-top">
        <div>
          <h2 id="results-title" className="section-title" style={{ margin: 0 }}>
            Race {raceCode(raceId)} · results
          </h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {race.racers.length} racers · {humanCount} {humanCount === 1 ? "human" : "humans"}
          </span>
        </div>
        <button className="btn" onClick={onClose}>
          Back to lobby
        </button>
      </div>

      <div className="podium" aria-label="Podium">
        {podium.map((e) => {
          const r = byId.get(e.racerId)!;
          return (
            <div key={e.rank} className={`step-block p${e.rank}`}>
              <div className="rank">{e.rank}</div>
              <div className="who" title={r.name}>
                <span className="dot" style={{ background: r.color }} />
                {r.name}
                {r.isBot && <span className="tag-bot">BOT</span>}
                {sameAddress(r.address, address) && <span className="tag-you">YOU</span>}
              </div>
              <div className="time">{raceTime(e.finishMs)}</div>
            </div>
          );
        })}
      </div>

      {mine && (
        <div className="my-result">
          <div className="place">
            #{mine.rank} <small>/ {race.ranking.length}</small>
          </div>
          <div className="facts">
            <span>
              Your time <b>{raceTime(mine.finishMs)}</b>
            </span>
            <span>
              Behind the winner <b>{mine.rank === 1 ? "—" : gap(mine.finishMs - winnerMs)}</b>
            </span>
          </div>
        </div>
      )}

      <div className="results-grid">
        <div className="panel table-wrap">
          <table className="board">
            <thead>
              <tr>
                <th className="r">Pos</th>
                <th>Racer</th>
                <th className="r">Time</th>
                <th className="r">Gap</th>
              </tr>
            </thead>
            <tbody>
              {race.ranking.map((e) => {
                const r = byId.get(e.racerId)!;
                const me = sameAddress(r.address, address);
                return (
                  <tr key={e.racerId} className={me ? "me" : ""}>
                    <td className="r num">{e.rank}</td>
                    <td>
                      <span className="dot" style={{ background: r.color }} />
                      {r.name}
                      {r.isBot && <span className="tag-bot">BOT</span>}
                      {me && <span className="tag-you">YOU</span>}
                    </td>
                    <td className="r num">{raceTime(e.finishMs)}</td>
                    <td className="r num muted">{e.rank === 1 ? "" : gap(e.finishMs - winnerMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Proof</h2>
          <p className="lede">
            The whole race was computed from one seed before the first frame. Same seed and same entrants give the same
            order, on any machine.
          </p>
          <div className="proof">
            <span>Seed</span>
            <code>{race.seed}</code>
            <span>Engine</span>
            <code>{race.engine}</code>
            <span>Published on Monad</span>
            {config.mode !== "testnet" ? (
              <code>demo mode — nothing published</code>
            ) : race.submitTx ? (
              <a href={explorerTx(config.explorerUrl, race.submitTx)} target="_blank" rel="noreferrer">
                <code>{race.submitTx.slice(0, 18)}… ↗</code>
              </a>
            ) : race.submitError ? (
              <code style={{ color: "var(--coral)" }}>not published: {race.submitError}</code>
            ) : config.submitResults ? (
              <code>publishing the podium…</code>
            ) : (
              <code>publishing is turned off (SUBMIT_RESULTS=0)</code>
            )}
          </div>
          <p className="hint">
            Check it yourself: <span className="mono" style={{ wordBreak: "break-all" }}>npm run simulate -- --seed {race.seed}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
