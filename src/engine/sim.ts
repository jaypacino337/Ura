// The live tape simulation: bot callers watch the market and fire callouts,
// engagement flows toward good calls, and winning calls accrue SOL from the
// reward pool. Everything here consumes the same public interfaces the real
// integrations would (market data in, calls + engagement out).

import { gradeCall } from "./verdict";
import type { Call, Caller, Token } from "./types";

export const BOT_HANDLES = [
  "trenchoracle",
  "0xMilady",
  "sniperjanitor",
  "capitulation_carl",
  "wagieMD",
  "insider_larp",
  "chartgoblin",
  "solmommy",
  "fumbles.eth",
  "liquidity_ghost",
  "topsignal_tony",
  "delusional_dave",
];

const THESES = [
  "team doxxed on spaces an hour ago, chart coiling",
  "this is the ticker everyone fades before it does 20x",
  "volume divergence on the 5m, someone is accumulating",
  "narrative play — the timeline hasn't noticed yet",
  "dev burned LP, holders climbing, mcap asleep",
  "clean higher lows since launch, no jeets left",
  "cult forming in the replies, that's the whole thesis",
  "first pullback after discovery leg, textbook entry",
  "whale wallet from the last runner just bought in",
  "it's literally free at this mcap",
  "bounced off launch price twice, floor is in",
  "cabal chat is quiet. too quiet. bidding",
];

export function makeBot(handle: string, i: number): Caller {
  return {
    id: `bot-${handle}`,
    handle,
    avatarHue: (i * 47 + 20) % 360,
    isUser: false,
    earnedSol: 0,
    wins: 0,
    losses: 0,
    calls: 0,
  };
}

let callSeq = 1;

export function makeCall(
  caller: Caller,
  token: Token,
  thesis: string,
  now: number
): Call {
  const verdict = gradeCall(token, caller, thesis, now);
  caller.calls++;
  return {
    id: `call-${callSeq++}-${now.toString(36)}`,
    callerId: caller.id,
    tokenId: token.id,
    createdAt: now,
    entryMcap: token.mcap,
    thesis,
    verdict,
    impressions: 0,
    agrees: 0,
    echoes: 0,
    fades: 0,
    accruedSol: 0,
    outcome: "open",
    peakX: 1,
  };
}

/** Bots prefer tokens that are moving or fresh — like real trench posters. */
export function botPickToken(tokens: Token[], rng: () => number): Token | null {
  const candidates = tokens.filter((t) => t.regime !== "rugged");
  if (candidates.length === 0) return null;
  const weights = candidates.map((t) => {
    const h = t.history;
    const m5 =
      h.length > 60 ? t.mcap / h[Math.max(0, h.length - 60)].mcap - 1 : 0;
    const freshness = Date.now() - t.launchedAt < 10 * 60_000 ? 1.5 : 0;
    return 1 + Math.max(m5, 0) * 6 + freshness;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    if (r < weights[i]) return candidates[i];
    r -= weights[i];
  }
  return candidates[candidates.length - 1];
}

export function randomThesis(rng: () => number): string {
  return THESES[Math.floor(rng() * THESES.length)];
}

/** Scoring window after which a call resolves. */
export const CALL_WINDOW_MS = 30 * 60_000;
export const WIN_X = 1.5; // reaching 1.5x inside the window = a win
export const LOSS_X = 0.6; // bleeding to 0.6x = a loss

/** SOL emitted to winning open calls per tick, split by rank-ish merit. */
export const REWARD_POOL_PER_TICK = 0.0025;

/**
 * Advance engagement + payouts one tick. Engagement is organic: cards near
 * the top of the tape get more eyeballs, good verdicts and green entries
 * convert eyeballs into agrees/echoes, bad calls collect fades.
 */
export function tickCalls(
  calls: Call[],
  tokens: Map<string, Token>,
  callers: Map<string, Caller>,
  rankOrder: string[], // call ids, best first
  now: number,
  rng: () => number
) {
  const rankIndex = new Map(rankOrder.map((id, i) => [id, i]));
  const open = calls.filter((c) => c.outcome === "open");

  // Merit for payout split: performance × conviction, winners only.
  let meritTotal = 0;
  const merits = new Map<string, number>();

  for (const call of open) {
    const token = tokens.get(call.tokenId);
    if (!token) continue;
    const x = token.mcap / call.entryMcap;
    call.peakX = Math.max(call.peakX, x);

    // Impressions flow by feed position (top of tape ≈ 10x the tail).
    const pos = rankIndex.get(call.id) ?? rankOrder.length;
    const eyeballs = Math.max(1, Math.round(12 / (1 + pos * 0.35)));
    call.impressions += eyeballs;

    // Conversion depends on how the call looks *right now*.
    const quality =
      (call.verdict.score / 100) * 0.5 + (x >= 1 ? Math.min(x - 1, 1) : 0) * 0.5;
    for (let i = 0; i < eyeballs; i++) {
      const roll = rng();
      if (roll < 0.05 + quality * 0.13) call.agrees++;
      else if (roll < 0.05 + quality * 0.13 + 0.015 + quality * 0.05)
        call.echoes++;
      else if (roll > 0.97 - (x < 0.85 ? 0.06 : 0)) call.fades++;
    }

    // Resolution.
    const expired = now - call.createdAt > CALL_WINDOW_MS;
    const caller = callers.get(call.callerId);
    if (call.peakX >= WIN_X) {
      call.outcome = "won";
      if (caller) caller.wins++;
    } else if (x <= LOSS_X || (expired && x < 1)) {
      call.outcome = "lost";
      if (caller) caller.losses++;
    } else if (expired) {
      call.outcome = x >= 1.15 ? "won" : "lost";
      if (caller) (call.outcome === "won" ? caller.wins++ : caller.losses++);
    }

    // Winners (and open calls in profit) earn from the pool.
    if (x > 1.05) {
      const merit = Math.log2(x + 1) * (0.5 + call.verdict.score / 100);
      merits.set(call.id, merit);
      meritTotal += merit;
    }
  }

  if (meritTotal > 0) {
    for (const [id, merit] of merits) {
      const call = open.find((c) => c.id === id);
      if (!call) continue;
      const sol = (REWARD_POOL_PER_TICK * merit) / meritTotal;
      call.accruedSol += sol;
      const caller = callers.get(call.callerId);
      if (caller) caller.earnedSol += sol;
    }
  }
}
