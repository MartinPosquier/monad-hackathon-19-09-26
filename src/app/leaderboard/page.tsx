"use client";

import { useCallback, useState } from "react";
import { TopBar } from "@/components/App";
import { useConfig, usePoll } from "@/components/hooks";
import { RecentRaces } from "@/components/RecentRaces";
import { api } from "@/lib/api";
import { explorerAddress, shortAddress } from "@/shared/chain";
import type { FinishedRaceSummary, LeaderboardRow } from "@/shared/types";

export default function LeaderboardPage() {
  const { config } = useConfig();
  const [data, setData] = useState<{ players: LeaderboardRow[]; recent: FinishedRaceSummary[] } | null>(null);
  const load = useCallback(async () => setData(await api("/api/leaderboard")), []);
  usePoll(load, 3000);

  return (
    <div className="shell">
      <TopBar config={config} active="leaderboard" />
      <h2 className="section-title">Leaderboard</h2>
      <div className="panel table-wrap">
        {!data ? (
          <p className="empty-note">Loading…</p>
        ) : !data.players.length ? (
          <p className="empty-note">No human has finished a race yet. Bots don&apos;t count here.</p>
        ) : (
          <table className="board">
            <thead>
              <tr>
                <th className="r">#</th>
                <th>Racer</th>
                <th className="r">Races</th>
                <th className="r">Wins</th>
                <th className="r">Podiums</th>
                <th className="r">Best</th>
                <th className="r">Avg pos</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((p, i) => (
                <tr key={p.address}>
                  <td className="r num">{i + 1}</td>
                  <td>
                    {p.name}{" "}
                    {config?.mode === "testnet" ? (
                      <a className="muted mono" href={explorerAddress(config.explorerUrl, p.address)} target="_blank" rel="noreferrer">
                        {shortAddress(p.address)}
                      </a>
                    ) : (
                      <span className="muted mono">{shortAddress(p.address)}</span>
                    )}
                  </td>
                  <td className="r num">{p.races}</td>
                  <td className="r num">{p.wins}</td>
                  <td className="r num">{p.podiums}</td>
                  <td className="r num">{p.bestRank}</td>
                  <td className="r num">{p.avgRank.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <h2 className="section-title">Recent podiums</h2>
      {data && <RecentRaces races={data.recent} explorerUrl={config?.explorerUrl ?? ""} />}
    </div>
  );
}
