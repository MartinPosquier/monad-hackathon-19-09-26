"use client";

/**
 * Orchestrateur de la page unique : lobby · course · résultat.
 * La vue affichée découle de la course suivie (`followId`) et de son statut dans le lobby.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { createBlockchainService } from "@/lib/blockchain";
import { sameAddress } from "@/lib/format";
import type { AppConfig, RoomSummary } from "@/shared/types";
import { useConfig, useHostToken, useLobby, usePlayer, useStoredString } from "./hooks";
import { Journey } from "./Journey";
import { LobbyPanel } from "./LobbyPanel";
import { RaceView } from "./RaceView";
import { RecentRaces } from "./RecentRaces";
import { Results } from "./Results";
import { Swimmer } from "./Swimmer";

export function App() {
  const { config, error } = useConfig();
  if (error) return <div className="boot">Could not reach the game server: {error}</div>;
  if (!config) return <div className="boot">Loading…</div>;
  return <Game config={config} />;
}

export function TopBar({ config, active }: { config: AppConfig | null; active: "race" | "leaderboard" }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="Monad Sperm Race, home">
        <Swimmer className="glyph" color="#836ef9" />
        <span>
          Monad <em>Sperm</em> Race
        </span>
      </Link>
      <span className="spacer" />
      {config && (
        <span className={`netbadge ${config.mode}`}>
          <span className="dot" aria-hidden="true" />
          {config.mode === "testnet" ? `Monad testnet · chain ${config.chainId}` : "Demo mode · no chain"}
        </span>
      )}
      <Link href={active === "race" ? "/leaderboard" : "/"} className="navlink">
        {active === "race" ? "Leaderboard" : "Back to the race"}
      </Link>
    </header>
  );
}

function Game({ config }: { config: AppConfig }) {
  const service = useMemo(() => createBlockchainService(config), [config]);
  const [address, setAddress] = useState<Address | null>(null);
  const [name, setName] = useStoredString("msr.name");
  const [followId, setFollowId] = useState<string | null>(null);
  const hostToken = useHostToken();
  const { lobby, serverNow, refresh } = useLobby();
  const { player, error: playerError, refresh: refreshPlayer } = usePlayer(service, address);

  useEffect(() => {
    void service.restoreWallet().then(setAddress);
    return service.onAccountChange(setAddress);
  }, [service]);

  const isMine = (r: RoomSummary) => !!address && r.racers.some((x) => sameAddress(x.address, address));
  const inOpenRoom = !!lobby && isMine(lobby.open);

  // Suivi automatique : un joueur inscrit (ou qui recharge la page) retrouve sa course.
  // Une seule fois par course : s'il revient au lobby pendant la course, on le laisse.
  const [autoFollowed, setAutoFollowed] = useState<string | null>(null);
  const myRace = lobby ? (lobby.live.find(isMine) ?? (isMine(lobby.open) ? lobby.open : null)) : null;
  if (myRace && myRace.raceId !== autoFollowed) {
    setAutoFollowed(myRace.raceId);
    setFollowId(myRace.raceId);
  }

  if (!lobby) {
    return (
      <div className="shell">
        <TopBar config={config} active="race" />
        <div className="boot">Connecting to the lobby…</div>
      </div>
    );
  }

  const followed =
    followId === null
      ? null
      : lobby.open.raceId === followId
        ? lobby.open
        : (lobby.live.find((r) => r.raceId === followId) ?? null);

  let view: React.ReactNode;
  if (followId && followed && (followed.status === "starting" || followed.status === "running")) {
    view = <RaceView raceId={followId} serverNow={serverNow} address={address} onLeave={() => setFollowId(null)} />;
  } else if (followId && !followed) {
    view = <Results raceId={followId} config={config} address={address} onClose={() => setFollowId(null)} />;
  } else {
    view = (
      <>
        <div className="grid-main">
          <Journey
            config={config}
            service={service}
            address={address}
            onConnected={setAddress}
            player={player}
            playerError={playerError}
            refreshPlayer={refreshPlayer}
            name={name}
            setName={setName}
            openRoom={lobby.open}
            inOpenRoom={inOpenRoom}
            onJoined={(id) => {
              setFollowId(id);
              void refresh();
            }}
          />
          <LobbyPanel
            lobby={lobby}
            lobbyMs={config.lobbySeconds * 1000}
            serverNow={serverNow}
            address={address}
            hostToken={hostToken}
            onWatch={setFollowId}
            refresh={refresh}
          />
        </div>
        <h2 className="section-title">Recent races</h2>
        <RecentRaces races={lobby.recent} explorerUrl={config.explorerUrl} onOpen={setFollowId} />
      </>
    );
  }

  return (
    <div className="shell">
      <TopBar config={config} active="race" />
      {hostToken && (
        <div className="hostbar">
          <strong>HOST</strong>
          <span>You can start the open race early from the grid.</span>
        </div>
      )}
      {view}
    </div>
  );
}
