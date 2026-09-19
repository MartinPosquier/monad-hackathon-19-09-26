"use client";

import { explorerTx } from "@/shared/chain";
import type { TxTiming } from "@/lib/blockchain";
import { useElapsed } from "./hooks";

export type ClockState =
  | { stage: "idle" }
  | { stage: "signing"; label: string }
  | { stage: "pending"; label: string; hash: string; sentAt: number }
  | { stage: "confirmed"; label: string; timing: TxTiming };

/**
 * Le chronomètre de finalité : de la diffusion de la tx à son reçu, en millisecondes.
 * C'est l'argument Monad montré plutôt que dit.
 */
export function FinalityClock({
  state,
  history,
  explorerUrl,
  simulated,
}: {
  state: ClockState;
  history: number[];
  explorerUrl: string;
  simulated: boolean;
}) {
  const elapsed = useElapsed(state.stage === "pending" ? state.sentAt : null);

  let readout: React.ReactNode = "—";
  let caption = "Sign a transaction to time Monad's finality.";
  if (state.stage === "signing") {
    readout = "0";
    caption = "Waiting for your signature in the wallet…";
  } else if (state.stage === "pending") {
    readout = Math.round(elapsed).toLocaleString("en-US");
    caption = "Broadcast. Waiting for the receipt…";
  } else if (state.stage === "confirmed") {
    readout = state.timing.ms.toLocaleString("en-US");
    caption = "From broadcast to receipt.";
  }

  const label = state.stage === "idle" ? "Finality clock" : state.label;
  const hash = state.stage === "pending" ? state.hash : state.stage === "confirmed" ? state.timing.hash : null;

  return (
    <div className={`clock ${state.stage}`} aria-live="polite">
      <div className="label">
        <span>{label}</span>
        {simulated && <span>simulated</span>}
      </div>
      <div className="readout">
        {readout}
        {state.stage !== "idle" && <small>ms</small>}
      </div>
      <div className="meta">
        <span>{caption}</span>
        {state.stage === "confirmed" && state.timing.blockNumber !== null && (
          <span className="mono">block {state.timing.blockNumber.toLocaleString("en-US")}</span>
        )}
        {hash && !simulated && (
          <a href={explorerTx(explorerUrl, hash)} target="_blank" rel="noreferrer">
            view tx ↗
          </a>
        )}
      </div>
      {history.length > 1 && (
        <div className="history" aria-label="Previous confirmation times">
          {history.map((ms, i) => (
            <span key={i}>{ms} ms</span>
          ))}
        </div>
      )}
      {state.stage === "pending" && <div className="sweep" />}
    </div>
  );
}
