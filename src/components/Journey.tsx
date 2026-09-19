"use client";

import { useState } from "react";
import type { Address } from "viem";
import { UserFacingError, type BlockchainService, type OnStage } from "@/lib/blockchain";
import { raceCode } from "@/lib/format";
import { explorerAddress, shortAddress } from "@/shared/chain";
import type { AppConfig, PlayerStatus, RoomSummary } from "@/shared/types";
import { FinalityClock, type ClockState } from "./FinalityClock";

interface Props {
  config: AppConfig;
  service: BlockchainService;
  address: Address | null;
  onConnected: (a: Address) => void;
  player: PlayerStatus | null;
  playerError: string | null;
  refreshPlayer: () => Promise<void>;
  name: string;
  setName: (v: string) => void;
  openRoom: RoomSummary | null;
  inOpenRoom: boolean;
  onJoined: (raceId: string) => void;
}

type Action = "connect" | "qualify" | "claim" | "join";

/** Le parcours joueur : wallet → qualification → ticket → entrée en course. */
export function Journey(p: Props) {
  const { config, service, address, player } = p;
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState<ClockState>({ stage: "idle" });
  const [history, setHistory] = useState<number[]>([]);
  const simulated = service.mode === "stub";

  const stageFor =
    (label: string): OnStage =>
    (s) => {
      if (s.stage === "signing") setClock({ stage: "signing", label });
      if (s.stage === "pending") setClock({ stage: "pending", label, hash: s.hash, sentAt: s.sentAt });
      if (s.stage === "confirmed") {
        setClock({ stage: "confirmed", label, timing: s.timing });
        setHistory((h) => [s.timing.ms, ...h].slice(0, 6));
      }
    };

  async function run(action: Action, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof UserFacingError || e instanceof Error ? e.message : String(e));
      setClock((c) => (c.stage === "signing" ? { stage: "idle" } : c));
    } finally {
      setBusy(null);
      void p.refreshPlayer();
    }
  }

  const connect = () =>
    run("connect", async () => {
      p.onConnected(await service.connectWallet());
    });
  const qualify = () => run("qualify", () => service.sendQualifyingTx(stageFor("Qualifying transaction")));
  const claim = () => run("claim", () => service.claimTicket(stageFor("claimTicket")));
  const join = () =>
    run("join", async () => {
      if (!p.openRoom) throw new Error("No race is open right now.");
      const out = await service.joinRace(p.openRoom.raceId, p.name, stageFor("joinRace"));
      p.onJoined(out.room.raceId);
    });

  const threshold = player?.threshold ?? config.threshold;
  const nonce = player?.nonce ?? 0;
  const qualified = !!player?.qualified;
  const tickets = player?.tickets ?? 0;
  const done = [!!address, qualified, tickets > 0 || p.inOpenRoom, p.inOpenRoom];
  const current = done.indexOf(false);
  const cls = (i: number) => `step ${done[i] ? "done" : i === current ? "current" : ""}`;
  const needsContract = config.mode === "testnet" && !config.contract;

  return (
    <section className="panel" aria-labelledby="journey-title">
      <h2 id="journey-title">Get on the grid</h2>
      <p className="lede">
        {simulated
          ? "Demo mode: no chain, no wallet. Every step is simulated so the race can run anywhere."
          : `Qualify with ${threshold.toLocaleString("en-US")} transactions on Monad testnet. You sign everything yourself.`}
      </p>

      {needsContract && (
        <p className="error-line">The race contract is not deployed yet. Qualification opens as soon as it is.</p>
      )}

      <ol className="steps">
        <li className={cls(0)}>
          <span className="marker">{done[0] ? "✓" : 1}</span>
          <div>
            <h3>{simulated ? "Use the demo wallet" : "Connect your wallet"}</h3>
            {address ? (
              <>
                <div className="row" style={{ marginBottom: 8 }}>
                  {simulated ? (
                    <span className="addr-chip">{shortAddress(address)}</span>
                  ) : (
                    <a className="addr-chip" href={explorerAddress(config.explorerUrl, address)} target="_blank" rel="noreferrer">
                      {shortAddress(address)} ↗
                    </a>
                  )}
                </div>
                <div className="row">
                  <input
                    className="name-input"
                    value={p.name}
                    onChange={(e) => p.setName(e.target.value.slice(0, 16))}
                    placeholder="Racer name (optional)"
                    aria-label="Racer name"
                    maxLength={16}
                  />
                </div>
              </>
            ) : (
              <>
                <p>{simulated ? "A throwaway address, kept in this browser." : "MetaMask switches to Monad testnet (chain 10143) for you."}</p>
                <button className="btn" onClick={connect} disabled={busy !== null}>
                  {busy === "connect" ? "Connecting…" : simulated ? "Use demo wallet" : "Connect wallet"}
                </button>
              </>
            )}
          </div>
        </li>

        <li className={cls(1)}>
          <span className="marker">{done[1] ? "✓" : 2}</span>
          <div>
            <h3>Qualify</h3>
            <p>Your wallet&apos;s lifetime transaction count, read live from the chain.</p>
            <div className="counter">
              <span className="big">{address && player ? nonce.toLocaleString("en-US") : "—"}</span>
              <span className="of">/ {threshold.toLocaleString("en-US")} tx</span>
            </div>
            {threshold <= 20 ? (
              <div className="ticks" aria-hidden="true">
                {Array.from({ length: threshold }, (_, i) => (
                  <span key={i} className={i < nonce ? "on" : ""} />
                ))}
              </div>
            ) : (
              <div className="bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (nonce / Math.max(threshold, 1)) * 100)}%` }} />
              </div>
            )}
            {qualified ? (
              <span className="ok">Qualified</span>
            ) : (
              <button className="btn ghost" onClick={qualify} disabled={!address || busy !== null || needsContract}>
                {busy === "qualify" ? "Sending…" : "Send a qualifying transaction"}
              </button>
            )}
            {!qualified && address && (
              <div className="hint">
                Sends 0 MON to yourself. You only pay gas.
                {!simulated && (
                  <>
                    {" "}
                    Out of MON?{" "}
                    <a href={config.faucetUrl} target="_blank" rel="noreferrer">
                      Monad faucet ↗
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </li>

        <li className={cls(2)}>
          <span className="marker">{done[2] ? "✓" : 3}</span>
          <div>
            <h3>Claim a race ticket</h3>
            <p>The server signs your count, the contract checks the signature and mints the ticket.</p>
            <div className="counter">
              <span className="big">{address && player ? tickets : "—"}</span>
              <span className="of">{tickets === 1 ? "ticket" : "tickets"}</span>
            </div>
            <button
              className={`btn ${tickets > 0 ? "ghost" : ""}`}
              onClick={claim}
              disabled={!qualified || busy !== null || needsContract}
            >
              {busy === "claim" ? "Claiming…" : tickets > 0 ? "Claim another ticket" : "Claim ticket"}
            </button>
          </div>
        </li>

        <li className={cls(3)}>
          <span className="marker">{done[3] ? "✓" : 4}</span>
          <div>
            <h3>Join the race</h3>
            {p.inOpenRoom ? (
              <p className="ok">You&apos;re on the grid for race {p.openRoom ? raceCode(p.openRoom.raceId) : ""}.</p>
            ) : (
              <>
                <p>Burns one ticket on-chain and puts you on the starting grid.</p>
                <button className="btn" onClick={join} disabled={tickets < 1 || busy !== null || !p.openRoom}>
                  {busy === "join" ? "Joining…" : `Join race ${p.openRoom ? raceCode(p.openRoom.raceId) : ""}`}
                </button>
              </>
            )}
          </div>
        </li>
      </ol>

      {(error || p.playerError) && <p className="error-line">{error ?? p.playerError}</p>}

      <FinalityClock state={clock} history={history} explorerUrl={config.explorerUrl} simulated={simulated} />
    </section>
  );
}
