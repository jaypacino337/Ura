// The feed ranker — Signal's fork of the open-sourced "For You" algorithm,
// adapted from timelines to trade callouts. Same skeleton, in the open:
//
//   1. Engagement heads — a weighted sum of predicted-engagement signals.
//      X's heavy ranker sums P(like), P(repost), P(reply)… × weights.
//      Ours sums observed rates: agrees (likes), echoes (reposts) and
//      fades (negative signal), each normalized per impression.
//   2. Cold-start math — fresh calls with few impressions get a Bayesian
//      prior blended in so they aren't buried before they get data,
//      plus an explicit explore boost in their first minutes.
//   3. Author diversity — repeated calls from the same caller decay
//      geometrically within a single feed so one loud account can't own
//      the tape.
//   4. Time decay — exponential half-life; the tape is about *now*.
//
// Signal adds two domain terms X doesn't have: the AI verdict (conviction
// 0-100) and live performance vs entry, because a call that's printing
// deserves the top of the tape.

import type { Call, RankedCall, Token } from "./types";

// Engagement-head weights (per-impression rates).
const W_AGREE = 30;
const W_ECHO = 55; // echoes are the strongest positive signal, like reposts
const W_FADE = -40;

// Cold start: Bayesian prior of `PRIOR_RATE` blended over PRIOR_N pseudo-impressions.
const PRIOR_N = 25;
const PRIOR_AGREE_RATE = 0.06;
const PRIOR_ECHO_RATE = 0.02;
const EXPLORE_WINDOW_MS = 5 * 60_000;
const EXPLORE_BOOST = 1.35;

// Author diversity: k-th call from the same author in one feed gets DECAY^k.
const AUTHOR_DECAY = 0.55;

// Freshness half-life.
const HALF_LIFE_MS = 25 * 60_000;

export function engagementScore(call: Call): number {
  const n = call.impressions;
  const agreeRate = (call.agrees + PRIOR_AGREE_RATE * PRIOR_N) / (n + PRIOR_N);
  const echoRate = (call.echoes + PRIOR_ECHO_RATE * PRIOR_N) / (n + PRIOR_N);
  const fadeRate = call.fades / (n + PRIOR_N);
  return W_AGREE * agreeRate + W_ECHO * echoRate + W_FADE * fadeRate;
}

export function performanceX(call: Call, token: Token | undefined): number {
  if (!token) return 1;
  return token.mcap / call.entryMcap;
}

/**
 * Rank all open calls into the feed order. Returns per-call breakdowns so the
 * UI can show exactly why each call sits where it sits — the tape is public,
 * the ranker is public.
 */
export function rankFeed(
  calls: Call[],
  tokens: Map<string, Token>,
  now: number
): RankedCall[] {
  const scored = calls.map((call) => {
    const age = now - call.createdAt;

    const eng = engagementScore(call);

    const conviction = 0.55 + (call.verdict.score / 100) * 0.9; // 0.55x–1.45x

    const perf = performanceX(call, tokens.get(call.tokenId));
    // log2 keeps a 10x from drowning everything; losses drag below 1.
    const perfTerm =
      perf >= 1
        ? 1 + Math.log2(perf) * 0.6
        : Math.max(0.35, 1 + Math.log2(perf) * 0.45);

    const freshness = Math.pow(0.5, age / HALF_LIFE_MS);

    const explore =
      age < EXPLORE_WINDOW_MS && call.impressions < 150 ? EXPLORE_BOOST : 1;

    const base = (6 + Math.max(eng, 0)) * conviction * perfTerm;
    const rankScore = base * freshness * explore;

    return {
      call,
      rankScore,
      breakdown: [
        { label: "engagement", value: eng },
        { label: "conviction", value: conviction },
        { label: "performance", value: perfTerm },
        { label: "freshness", value: freshness },
        { label: "explore", value: explore },
      ],
    };
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);

  // Author-diversity pass over the sorted list.
  const seen = new Map<string, number>();
  for (const item of scored) {
    const k = seen.get(item.call.callerId) ?? 0;
    if (k > 0) {
      const decay = Math.pow(AUTHOR_DECAY, k);
      item.rankScore *= decay;
      item.breakdown.push({ label: "diversity", value: decay });
    }
    seen.set(item.call.callerId, k + 1);
  }
  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored;
}
