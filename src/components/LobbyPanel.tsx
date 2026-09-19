"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { countdown, raceCode, sameAddress } from "@/lib/format";
import type { LobbyResponse } from "@/shared/types";
import { useTicker } from "./hooks";
import { Swimmer } from "./Swimmer";

interface Props {
  lobby: LobbyResponse;
  /** Durée du compte à rebours, affichée en attente du premier joueur. */
  lobbyMs: number;
  serverNow: () => number;
  address: string | null;
  hostToken: string | null;
  onWatch: (raceId: string) => void;
  refresh: () => Promise<void>;
}

/** La grille de départ : 50 cases, les humains s'y posent, les bots comblent au départ. */
export function LobbyPanel({ lobby, lobbyMs, serverNow, address, hostToken, onWatch, refresh }: Props) {
  useTicker(250);
  const [starting, setStarting] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const room = lobby.open;
  const humans = room.racers;
  const bots = room.size - humans.length;
  const remaining = room.lobbyEndsAt !== null ? room.lobbyEndsAt - serverNow() : null;

  async function startNow() {
    setStarting(true);
    setHostError(null);
    try {
      await api("/api/host", { method: "POST", headers: { "x-host-token": hostToken ?? "" } });
      await refresh();
    } catch (e) {
      setHostError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="lobby-title">
      <div className="lobby-head">
        <div>
          <h2 id="lobby-title">Next race</h2>
          <div className="race-id">
            {raceCode(room.raceId)} · {humans.length} {humans.length === 1 ? "racer" : "racers"} · {bots} bot slots
          </div>
        </div>
        <div className="countdown" aria-live="polite">
          {remaining === null ? (
            <>
              <div className="t muted">{countdown(lobbyMs)}</div>
              <div className="l">Countdown starts with the first racer</div>
            </>
          ) : (
            <>
              <div className="t">{countdown(remaining)}</div>
              <div className="l">until the start</div>
            </>
          )}
        </div>
      </div>

      <div className="startgrid" role="list" aria-label="Starting grid">
        {Array.from({ length: room.size }, (_, i) => {
          const r = humans[i];
          if (!r) {
            return (
              <div key={i} className="slot empty" role="listitem" aria-label={`Slot ${i + 1}: filled by a bot at the start`}>
                <span className="n">{i + 1}</span>
                <span className="who">BOT</span>
              </div>
            );
          }
          const me = sameAddress(r.address, address);
          return (
            <div key={i} className={`slot human ${me ? "me" : ""}`} role="listitem" title={r.name}>
              <span className="n">{i + 1}</span>
              <Swimmer color={r.color} />
              <span className="who">{me ? "You" : r.name}</span>
            </div>
          );
        })}
      </div>

      <div className="lobby-foot">
        <span>Empty slots race as bots, labelled BOT everywhere. The finish order is computed before the start.</span>
        {hostToken && (
          <button className="btn small" onClick={startNow} disabled={starting}>
            {starting ? "Starting…" : "Start now"}
          </button>
        )}
      </div>
      {hostError && <p className="error-line">{hostError}</p>}

      {lobby.live.map((live) => (
        <div className="live-banner" key={live.raceId}>
          <span className="pulse" aria-hidden="true" />
          <span className="grow">
            Race {raceCode(live.raceId)} is {live.status === "starting" ? "about to start" : "live"} · {live.humans}{" "}
            {live.humans === 1 ? "human" : "humans"}
          </span>
          <button className="btn small ghost" onClick={() => onWatch(live.raceId)}>
            Watch
          </button>
        </div>
      ))}
    </section>
  );
}
