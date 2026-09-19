import { raceCode, raceTime } from "@/lib/format";
import { explorerTx } from "@/shared/chain";
import type { FinishedRaceSummary } from "@/shared/types";

export function RecentRaces({
  races,
  explorerUrl,
  onOpen,
}: {
  races: FinishedRaceSummary[];
  explorerUrl: string;
  onOpen?: (raceId: string) => void;
}) {
  if (!races.length) return <p className="empty-note">No race has finished yet. The first podium will show up here.</p>;
  return (
    <div className="recent">
      {races.map((r) => (
        <article className="card" key={r.raceId}>
          <header>
            <span className="mono">{raceCode(r.raceId)}</span>
            <span>
              {r.humans} {r.humans === 1 ? "human" : "humans"}
              {r.submitTx && (
                <>
                  {" · "}
                  <a href={explorerTx(explorerUrl, r.submitTx)} target="_blank" rel="noreferrer">
                    on-chain ↗
                  </a>
                </>
              )}
            </span>
          </header>
          <ol>
            {r.podium.map((p) => (
              <li key={p.rank}>
                <span className="p">{p.rank}</span>
                <span className="nm">
                  {p.name}
                  {p.isBot && <span className="tag-bot">BOT</span>}
                </span>
                <span className="mono muted">{raceTime(p.finishMs)}</span>
              </li>
            ))}
          </ol>
          {onOpen && (
            <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => onOpen(r.raceId)}>
              Full results
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
