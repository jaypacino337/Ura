// Auditable round randomness: commit-reveal over sha256.
//
//   round open:   commitment = sha256(`${roundId}:${seed}`) is published
//   settlement:   seed is revealed
//   anyone:       recompute the commitment and every derived outcome below
//
// All outcomes (strike plot, grade layout, receipt hash) are pure functions
// of the seed, so a revealed seed fixes the entire settlement. The Verify
// button in the UI reruns exactly these functions in your browser.

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { PLOTS, TRANCHES, type Grade } from "./types";

export const hashHex = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));

export const commitmentFor = (roundId: number, seed: string) =>
  hashHex(`${roundId}:${seed}`);

export function randomSeed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}

/** Deterministic PRNG stream from a label under the seed. */
function seededStream(seed: string, label: string): () => number {
  let counter = 0;
  let pool: Uint8Array = sha256(utf8ToBytes(`${seed}:${label}:0`));
  let idx = 0;
  return () => {
    if (idx + 4 > pool.length) {
      counter++;
      pool = sha256(utf8ToBytes(`${seed}:${label}:${counter}`));
      idx = 0;
    }
    const v =
      ((pool[idx] << 24) | (pool[idx + 1] << 16) | (pool[idx + 2] << 8) | pool[idx + 3]) >>>
      0;
    idx += 4;
    return v / 0xffffffff;
  };
}

export function deriveStrike(seed: string): number {
  const h = sha256(utf8ToBytes(`${seed}:strike`));
  return (((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % PLOTS;
}

/** Full grade layout: strike + tranche plots placed by a seeded shuffle. */
export function deriveGrades(seed: string): { strike: number; grades: Grade[] } {
  const strike = deriveStrike(seed);
  const grades: Grade[] = new Array(PLOTS).fill("BARREN");
  grades[strike] = "MOTHERLODE";

  const rest = [...Array(PLOTS).keys()].filter((i) => i !== strike);
  const rng = seededStream(seed, "grades");
  // Fisher-Yates with the deterministic stream.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  let cursor = 0;
  for (const tranche of TRANCHES) {
    if (tranche.grade === "MOTHERLODE") continue;
    for (let k = 0; k < tranche.count; k++) {
      grades[rest[cursor++]] = tranche.grade;
    }
  }
  return { strike, grades };
}

/** True-barren plots a surveyor may be shown (never the strike). */
export function deriveSurveyables(seed: string): number[] {
  const { grades } = deriveGrades(seed);
  const barren = [...Array(PLOTS).keys()].filter((i) => grades[i] === "BARREN");
  const rng = seededStream(seed, "survey");
  for (let i = barren.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [barren[i], barren[j]] = [barren[j], barren[i]];
  }
  return barren;
}

export const receiptHash = (seed: string) => `0x${hashHex(`${seed}:settle`)}`;
