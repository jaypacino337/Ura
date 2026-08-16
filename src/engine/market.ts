// Simulated pump.fun-style market: a rotating cast of memecoins whose mcaps
// follow regime-switching random walks (accumulation, vertical pumps, dumps,
// crab, the occasional rug). This module is the data source seam — swap it
// for a real firehose (pump.fun websocket) without touching ranking or UI.

import type { Token } from "./types";

const NAMES: [string, string, string][] = [
  ["WIFHAT2", "dogwifhat 2.0", "🐶"],
  ["GLONK", "glonk", "🐸"],
  ["SOLDAD", "solana dad", "👨‍🦳"],
  ["RETARDIO", "retardio bros", "🤪"],
  ["MOONCAT", "mooncat", "🐱"],
  ["PONZI", "honest ponzi", "🎪"],
  ["GIGACHAD", "gigachad", "🗿"],
  ["FUDCOIN", "fudcoin", "😱"],
  ["BAGGIE", "eternal baggie", "💼"],
  ["SENDIT", "send it", "🚀"],
  ["COPE", "copium reserve", "😤"],
  ["NPC", "npc season", "🧍"],
  ["DEGEN", "certified degen", "🎰"],
  ["RUGME", "rug insurance", "🧻"],
  ["CHUD", "chudjak", "😐"],
  ["LAMBO", "when lambo", "🏎️"],
  ["PVP", "pvp arena", "⚔️"],
  ["ALPHA", "leaked alpha", "🔓"],
  ["EXIT", "exit liquidity", "🚪"],
  ["WAGMI", "wagmi industries", "🤝"],
];

export const HISTORY_LEN = 360; // ~30 min of 5s candles on screen

let nextTokenIdx = 0;

export function makeToken(now: number, rng: () => number): Token {
  const [ticker, name, emoji] = NAMES[nextTokenIdx % NAMES.length];
  nextTokenIdx++;
  const mcap = 5_000 + rng() * 60_000; // fresh launches start small
  return {
    id: `${ticker.toLowerCase()}-${now.toString(36)}`,
    ticker,
    name,
    emoji,
    mcap,
    athMcap: mcap,
    launchedAt: now,
    history: [{ t: now, mcap }],
    regime: "accumulation",
    regimeUntil: now + (20 + rng() * 90) * 1000,
    vol24h: mcap * (2 + rng() * 8),
    holders: 10 + Math.floor(rng() * 40),
  };
}

/** Per-regime drift (per tick) and volatility. */
const REGIMES: Record<
  Token["regime"],
  { drift: number; vol: number; next: [Token["regime"], number][] }
> = {
  accumulation: {
    drift: 0.0035,
    vol: 0.012,
    next: [
      ["pump", 0.45],
      ["crab", 0.35],
      ["dump", 0.2],
    ],
  },
  pump: {
    drift: 0.028,
    vol: 0.035,
    next: [
      ["dump", 0.45],
      ["crab", 0.4],
      ["pump", 0.15],
    ],
  },
  dump: {
    drift: -0.024,
    vol: 0.03,
    next: [
      ["crab", 0.5],
      ["accumulation", 0.35],
      ["dump", 0.15],
    ],
  },
  crab: {
    drift: 0.0,
    vol: 0.008,
    next: [
      ["accumulation", 0.4],
      ["pump", 0.3],
      ["dump", 0.3],
    ],
  },
  rugged: { drift: -0.002, vol: 0.004, next: [["rugged", 1]] },
};

function pickNext(
  options: [Token["regime"], number][],
  rng: () => number
): Token["regime"] {
  let r = rng();
  for (const [regime, p] of options) {
    if (r < p) return regime;
    r -= p;
  }
  return options[0][0];
}

/** Advance one token by one tick. Mutates in place. */
export function tickToken(token: Token, now: number, rng: () => number) {
  if (token.regime !== "rugged" && now >= token.regimeUntil) {
    token.regime = pickNext(REGIMES[token.regime].next, rng);
    token.regimeUntil = now + (15 + rng() * 120) * 1000;
    // A fresh pump occasionally goes fully vertical.
    if (token.regime === "pump" && rng() < 0.25) {
      token.regimeUntil = now + (30 + rng() * 60) * 1000;
    }
  }
  // Rare rug event on non-blue-chip caps.
  if (
    token.regime !== "rugged" &&
    token.mcap < 2_000_000 &&
    rng() < 0.0004
  ) {
    token.regime = "rugged";
    token.mcap *= 0.12 + rng() * 0.15;
  }

  const { drift, vol } = REGIMES[token.regime];
  // Log-normal step with mean-reversion pull for huge caps.
  const gravity = token.mcap > 5_000_000 ? -0.004 : 0;
  const step =
    drift + gravity + vol * (rng() * 2 - 1) + vol * (rng() * 2 - 1) * 0.5;
  token.mcap = Math.max(800, token.mcap * (1 + step));
  token.athMcap = Math.max(token.athMcap, token.mcap);
  token.vol24h = Math.max(1000, token.vol24h * (1 + step * 0.6));
  if (rng() < 0.3) {
    token.holders = Math.max(
      5,
      token.holders + (step > 0 ? 1 : -1) * Math.ceil(rng() * 3)
    );
  }

  token.history.push({ t: now, mcap: token.mcap });
  if (token.history.length > HISTORY_LEN) token.history.shift();
}

export function fmtMcap(mcap: number): string {
  if (mcap >= 1_000_000_000) return `$${(mcap / 1_000_000_000).toFixed(2)}B`;
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`;
  return `$${Math.round(mcap)}`;
}
