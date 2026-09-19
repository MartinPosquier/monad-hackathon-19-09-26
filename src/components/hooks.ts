"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { api } from "@/lib/api";
import type { BlockchainService } from "@/lib/blockchain";
import type { AppConfig, LobbyResponse, PlayerStatus } from "@/shared/types";

/** Appelle `fn` toutes les `ms` millisecondes, sans jamais chevaucher deux appels. */
export function usePoll(fn: () => Promise<void>, ms: number, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      try {
        await ref.current();
      } catch {
        /* le prochain tour réessaiera */
      }
      if (!stop) timer = setTimeout(loop, ms);
    };
    void loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [ms, enabled]);
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<AppConfig>("/api/config").then(setConfig, (e: Error) => setError(e.message));
  }, []);
  return { config, error };
}

/**
 * Lobby interrogé chaque seconde. Le client se cale sur l'horloge du serveur (offset
 * mesuré à la réponse la plus rapide) : tout le monde part au même `startAt`.
 */
export function useLobby() {
  const [lobby, setLobby] = useState<LobbyResponse | null>(null);
  const offset = useRef(0);
  const bestRtt = useRef(Infinity);

  const refresh = useCallback(async () => {
    const t0 = Date.now();
    const data = await api<LobbyResponse>("/api/lobby");
    const rtt = Date.now() - t0;
    if (rtt <= bestRtt.current + 20) {
      bestRtt.current = Math.min(bestRtt.current, rtt);
      offset.current = data.now + rtt / 2 - Date.now();
    }
    setLobby(data);
  }, []);

  usePoll(refresh, 1000);
  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { lobby, serverNow, refresh };
}

export function usePlayer(service: BlockchainService, address: Address | null) {
  // Le statut est rangé avec l'adresse qu'il décrit : changer de compte l'invalide aussitôt.
  const [state, setState] = useState<{ address: Address; player: PlayerStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setState({ address, player: await service.checkEligibility(address) });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [service, address]);

  usePoll(refresh, 2000, !!address);
  const player = state && address && state.address === address ? state.player : null;
  return { player, error: address ? error : null, refresh };
}

/** Jeton hôte : lu une fois dans ?host=…, gardé en localStorage, validé par le serveur. */
export function useHostToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let t: string | null = null;
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get("host");
      if (fromUrl) {
        localStorage.setItem("msr.host", fromUrl);
        url.searchParams.delete("host");
        window.history.replaceState(null, "", url.toString());
      }
      t = fromUrl ?? localStorage.getItem("msr.host");
    } catch {
      /* stockage indisponible */
    }
    if (!t) return;
    api("/api/host", { headers: { "x-host-token": t } }).then(
      () => setToken(t),
      () => setToken(null),
    );
  }, []);
  return token;
}

/** Valeur gardée en localStorage. N'utiliser que dans un composant monté côté client seulement. */
export function useStoredString(key: string, initial = "") {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: string) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* ignoré */
      }
    },
    [key],
  );
  return [value, set] as const;
}

/** Millisecondes écoulées depuis `since` (horloge performance.now), rafraîchies à chaque frame. */
export function useElapsed(since: number | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (since === null) return;
    let id = 0;
    const loop = () => {
      setElapsed(performance.now() - since);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [since]);
  return since === null ? 0 : elapsed;
}

/** Rafraîchit le composant toutes les `ms` (compte à rebours du lobby). */
export function useTicker(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), ms);
    return () => clearInterval(id);
  }, [ms]);
}
