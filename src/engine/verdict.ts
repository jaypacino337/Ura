// The AI verdict: every call gets graded 0-100 the moment it hits the tape.
// The grader is a transparent factor model over market structure and caller
// history — deterministic, inspectable, and shown on every card. (In a
// production build this seam is where an LLM or trained model would slot in;
// the factor readings become its features.)

import type { Caller, Token, Verdict } from "./types";

interface Factor {
  label: string;
  value: number; // 0..1 contribution before weighting
  weight: number;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function momentum(token: Token, minutes: number): number {
  const h = token.history;
  if (h.length < 2) return 0;
  const cutoff = h[h.length - 1].t - minutes * 60_000;
  let start = h[0];
  for (const p of h) {
    if (p.t >= cutoff) {
      start = p;
      break;
    }
  }
  return token.mcap / start.mcap - 1;
}

export function gradeCall(
  token: Token,
  caller: Caller,
  thesis: string,
  now: number
): Verdict {
  const m5 = momentum(token, 5);
  const m15 = momentum(token, 15);
  const drawdownFromAth = 1 - token.mcap / token.athMcap;
  const ageMin = (now - token.launchedAt) / 60_000;

  const factors: Factor[] = [];

  // Entry location: buying -70% off ATH ≠ buying the top of a vertical.
  factors.push({
    label: "entry vs ATH",
    value: clamp01(0.25 + drawdownFromAth * 1.5),
    weight: 0.22,
  });

  // Chasing detection: hard penalty for calling after a +80% 5-minute candle.
  factors.push({
    label: "chase risk",
    value: clamp01(1 - Math.max(m5, 0) * 1.1),
    weight: 0.2,
  });

  // Trend quality: steady 15m bid > dead tape > freefall.
  factors.push({
    label: "trend",
    value: clamp01(0.5 + m15 * 1.4),
    weight: 0.18,
  });

  // Rug / structure risk: fresh microcaps and rugged charts score low.
  const structure =
    token.regime === "rugged"
      ? 0
      : clamp01(
          0.3 +
            Math.min(ageMin / 60, 1) * 0.35 +
            Math.min(token.holders / 200, 1) * 0.35
        );
  factors.push({ label: "structure", value: structure, weight: 0.2 });

  // Caller track record, with a neutral prior for fresh accounts.
  const resolved = caller.wins + caller.losses;
  const winRate = (caller.wins + 3) / (resolved + 6);
  factors.push({ label: "caller record", value: clamp01(winRate), weight: 0.12 });

  // Thesis effort: a real writeup beats a bare ticker ping.
  factors.push({
    label: "thesis",
    value: clamp01(0.3 + Math.min(thesis.trim().length / 120, 1) * 0.7),
    weight: 0.08,
  });

  const raw = factors.reduce((acc, f) => acc + f.value * f.weight, 0);
  const score = Math.round(clamp01(raw) * 100);

  const grade =
    score >= 85 ? "S" : score >= 70 ? "A" : score >= 55 ? "B" : score >= 40 ? "C" : score >= 25 ? "D" : "F";

  return {
    score,
    grade,
    note: buildNote(score, { m5, m15, drawdownFromAth, ageMin, token }),
    factors: factors.map((f) => ({
      label: f.label,
      value: Math.round(f.value * 100),
      weight: f.weight,
    })),
  };
}

function buildNote(
  score: number,
  ctx: {
    m5: number;
    m15: number;
    drawdownFromAth: number;
    ageMin: number;
    token: Token;
  }
): string {
  const bits: string[] = [];
  if (ctx.token.regime === "rugged") {
    return "chart is post-rug — this is a memorial service, not an entry";
  }
  if (ctx.m5 > 0.5) {
    bits.push(`entry after a +${Math.round(ctx.m5 * 100)}% vertical — chasing`);
  } else if (ctx.m5 < -0.25) {
    bits.push("knife still falling on the 5m");
  } else if (ctx.m15 > 0.15) {
    bits.push("steady bid on the 15m");
  } else if (ctx.drawdownFromAth > 0.6) {
    bits.push(`${Math.round(ctx.drawdownFromAth * 100)}% off highs — deep value or dead`);
  } else {
    bits.push("flat tape, needs a catalyst");
  }
  if (ctx.ageMin < 20) bits.push("fresh launch, thin history");
  else if (ctx.token.holders > 150) bits.push("holder base building");

  const verdictWord =
    score >= 85
      ? "high conviction"
      : score >= 70
        ? "credible"
        : score >= 55
          ? "coin flip with upside"
          : score >= 40
            ? "weak setup"
            : "exit liquidity candidate";
  return `${bits.join("; ")} — ${verdictWord}`;
}
