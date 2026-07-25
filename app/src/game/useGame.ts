import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChainBackend } from "../chain/client";
import { DemoBackend } from "./demo";
import type {
  ConfigState,
  GameBackend,
  LeaderboardEntry,
  ProofState,
} from "./types";

export type Mode = "demo" | "devnet";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

export interface Find {
  id: number;
  time: number;
  difficulty: number;
  reward: bigint;
  streak: number;
}

let nextId = 1;

export function useGame() {
  const [mode, setMode] = useState<Mode>("demo");
  const backend: GameBackend = useMemo(
    () => (mode === "demo" ? new DemoBackend() : new ChainBackend()),
    [mode]
  );

  const [address, setAddress] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [proof, setProof] = useState<ProofState | null>(null);
  const [walletUra, setWalletUra] = useState<bigint>(0n);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [finds, setFinds] = useState<Find[]>([]);
  const [busy, setBusy] = useState(false);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [cfg, prf, bal, board] = await Promise.all([
        backend.getConfig(),
        backend.getProof(),
        backend.walletBalance(),
        backend.leaderboard(),
      ]);
      setConfig(cfg);
      setProof(prf);
      setWalletUra(bal);
      setLeaderboard(board);
    } catch (err) {
      // Config missing on devnet etc. — surface once, keep UI alive.
      setConfig(null);
      setProof(null);
      toast("error", err instanceof Error ? err.message : String(err));
    }
  }, [backend, toast]);

  // Auto-connect + initial load. Demo connects instantly; devnet waits for
  // the user to click Connect.
  const connectedRef = useRef(false);
  useEffect(() => {
    connectedRef.current = false;
    setAddress(null);
    setConfig(null);
    setProof(null);
    setFinds([]);
    if (backend.mode === "demo") {
      void backend.connect().then((addr) => {
        connectedRef.current = true;
        setAddress(addr);
        void refresh();
      });
    }
  }, [backend, refresh]);

  const connect = useCallback(async () => {
    try {
      const addr = await backend.connect();
      connectedRef.current = true;
      setAddress(addr);
      await refresh();
      toast("success", "Wallet connected");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    }
  }, [backend, refresh, toast]);

  const register = useCallback(async () => {
    setBusy(true);
    try {
      await backend.register();
      await refresh();
      toast("success", "Miner registered — grab your pickaxe!");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [backend, refresh, toast]);

  const act = useCallback(
    async (fn: () => Promise<void>, okMsg: string) => {
      setBusy(true);
      try {
        await fn();
        await refresh();
        toast("success", okMsg);
      } catch (err) {
        toast("error", err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [refresh, toast]
  );

  const recordFind = useCallback(
    (r: { reward: bigint; difficulty: number; streak: number }) => {
      setFinds((f) =>
        [
          {
            id: nextId++,
            time: Date.now(),
            difficulty: r.difficulty,
            reward: r.reward,
            streak: r.streak,
          },
          ...f,
        ].slice(0, 12)
      );
      void refresh();
    },
    [refresh]
  );

  return {
    mode,
    setMode,
    backend,
    address,
    config,
    proof,
    walletUra,
    leaderboard,
    toasts,
    toast,
    finds,
    recordFind,
    busy,
    connect,
    register,
    refresh,
    act,
  };
}
