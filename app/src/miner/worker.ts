/// <reference lib="webworker" />
// Proof-of-work miner. Hashes nonces sequentially from a random start and
// reports the best solution found so far a few times per second.

import { keccak_256 } from "@noble/hashes/sha3";

interface StartMsg {
  cmd: "start";
  challenge: Uint8Array;
  authority: Uint8Array;
  startNonce: string; // bigint as string (structured clone keeps bigint, but be safe)
}
interface StopMsg {
  cmd: "stop";
}
type InMsg = StartMsg | StopMsg;

export interface TickMsg {
  type: "tick";
  hashes: number;
  hps: number;
  best: { nonce: string; difficulty: number; hashHex: string };
}

let running = false;

function leadingZeroBits(hash: Uint8Array): number {
  let count = 0;
  for (const byte of hash) {
    if (byte === 0) count += 8;
    else {
      count += Math.clz32(byte) - 24;
      break;
    }
  }
  return Math.min(count, 255);
}

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.cmd === "stop") {
    running = false;
    return;
  }
  running = true;
  const { challenge, authority } = msg;
  let nonce = BigInt(msg.startNonce);

  const buf = new Uint8Array(72);
  buf.set(challenge, 0);
  buf.set(authority, 32);
  const view = new DataView(buf.buffer);

  let totalHashes = 0;
  let best: { nonce: bigint; difficulty: number; hash: Uint8Array } = {
    nonce: 0n,
    difficulty: -1,
    hash: new Uint8Array(32),
  };
  let windowHashes = 0;
  let windowStart = performance.now();

  const BATCH = 3000;
  const loop = () => {
    if (!running) return;
    for (let i = 0; i < BATCH; i++) {
      view.setBigUint64(64, nonce, true);
      const hash = keccak_256(buf);
      const diff = leadingZeroBits(hash);
      if (diff > best.difficulty) {
        best = { nonce, difficulty: diff, hash };
      }
      nonce++;
    }
    totalHashes += BATCH;
    windowHashes += BATCH;

    const now = performance.now();
    if (now - windowStart >= 250) {
      const hps = (windowHashes / (now - windowStart)) * 1000;
      const tick: TickMsg = {
        type: "tick",
        hashes: totalHashes,
        hps,
        best: {
          nonce: best.nonce.toString(),
          difficulty: best.difficulty,
          hashHex: toHex(best.hash),
        },
      };
      (self as unknown as Worker).postMessage(tick);
      windowHashes = 0;
      windowStart = now;
    }
    // Yield to the event loop so stop messages are handled promptly.
    setTimeout(loop, 0);
  };
  loop();
};
