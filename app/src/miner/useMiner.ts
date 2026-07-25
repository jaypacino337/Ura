import { useCallback, useEffect, useRef, useState } from "react";
import type { GameBackend, MineResult } from "../game/types";
import type { TickMsg } from "./worker";

export interface BestSolution {
  nonce: string;
  difficulty: number;
  hashHex: string;
}

export interface MinerStatus {
  running: boolean;
  phase: "idle" | "hashing" | "submitting";
  hps: number;
  totalHashes: number;
  best: BestSolution | null;
  /** Earliest moment a solution can be submitted (ms epoch). */
  submitAt: number | null;
  minDifficulty: number;
}

const IDLE: MinerStatus = {
  running: false,
  phase: "idle",
  hps: 0,
  totalHashes: 0,
  best: null,
  submitAt: null,
  minDifficulty: 0,
};

/**
 * Drives the mining loop: hash in a WebWorker for the whole cooldown window,
 * keep the best solution found, submit it as soon as the cooldown allows,
 * then roll into the next round automatically until stopped.
 */
export function useMiner(
  backend: GameBackend,
  onResult: (r: MineResult) => void,
  onError: (msg: string) => void
) {
  const [status, setStatus] = useState<MinerStatus>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const runningRef = useRef(false);
  const bestRef = useRef<BestSolution | null>(null);

  const stopWorker = () => {
    workerRef.current?.postMessage({ cmd: "stop" });
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  const stop = useCallback(() => {
    runningRef.current = false;
    stopWorker();
    setStatus(IDLE);
  }, []);

  useEffect(() => stop, [stop, backend]);

  const runRound = useCallback(async () => {
    if (!runningRef.current) return;
    try {
      const [config, proof] = await Promise.all([
        backend.getConfig(),
        backend.getProof(),
      ]);
      if (!proof) throw new Error("Not registered");
      const authority = backend.authorityBytes();
      if (!authority) throw new Error("No wallet");

      const cooldownMs = backend.cooldown() * 1000;
      const submitAt = Math.max(
        Date.now() + 1500, // always hash a little before submitting
        (proof.lastMineAt + backend.cooldown()) * 1000 + 500
      );
      bestRef.current = null;
      setStatus({
        running: true,
        phase: "hashing",
        hps: 0,
        totalHashes: 0,
        best: null,
        submitAt,
        minDifficulty: config.minDifficulty,
      });

      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<TickMsg>) => {
        const t = e.data;
        if (t.type !== "tick") return;
        bestRef.current = t.best;
        setStatus((s) =>
          s.phase === "hashing"
            ? { ...s, hps: t.hps, totalHashes: t.hashes, best: t.best }
            : s
        );
      };
      const startNonce =
        (BigInt(Math.floor(Math.random() * 0xffffffff)) << 32n) |
        BigInt(Math.floor(Math.random() * 0xffffffff));
      worker.postMessage({
        cmd: "start",
        challenge: proof.challenge,
        authority,
        startNonce: startNonce.toString(),
      });

      // Wait until cooldown has passed AND we have a good-enough solution.
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!runningRef.current) return resolve();
          const ready =
            Date.now() >= submitAt &&
            (bestRef.current?.difficulty ?? -1) >= config.minDifficulty;
          if (ready) return resolve();
          setTimeout(check, 200);
        };
        check();
      });
      stopWorker();
      if (!runningRef.current) return;

      // Cast: TS's flow analysis can't see the worker callback assignments.
      const best = bestRef.current as BestSolution | null;
      if (!best) throw new Error("No solution found");
      setStatus((s) => ({ ...s, phase: "submitting" }));
      const result = await backend.submitSolution(BigInt(best.nonce));
      onResult(result);

      // Roll straight into the next round.
      void cooldownMs;
      if (runningRef.current) setTimeout(() => void runRound(), 400);
    } catch (err) {
      stopWorker();
      if (runningRef.current) {
        onError(err instanceof Error ? err.message : String(err));
        runningRef.current = false;
        setStatus(IDLE);
      }
    }
  }, [backend, onResult, onError]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    void runRound();
  }, [runRound]);

  return { status, start, stop };
}
