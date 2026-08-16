/** A memecoin on the tape. */
export interface Token {
  id: string;
  ticker: string;
  name: string;
  emoji: string;
  /** Market cap in USD. */
  mcap: number;
  athMcap: number;
  launchedAt: number;
  /** Price history ring buffer: one point per tick (ms epoch + mcap). */
  history: { t: number; mcap: number }[];
  /** Current market regime driving the random walk. */
  regime: "accumulation" | "pump" | "dump" | "crab" | "rugged";
  regimeUntil: number;
  vol24h: number;
  holders: number;
}

/** The AI grade attached to every call the moment it's made. */
export interface Verdict {
  /** Conviction score 0-100. */
  score: number;
  /** Grade bucket for display. */
  grade: "S" | "A" | "B" | "C" | "D" | "F";
  /** One-line reasoning shown on the card. */
  note: string;
  /** Individual factor readings that produced the score. */
  factors: { label: string; value: number; weight: number }[];
}

/** A caller identity (bot or the user). */
export interface Caller {
  id: string;
  handle: string;
  avatarHue: number;
  isUser: boolean;
  /** Lifetime SOL accrued from winning calls. */
  earnedSol: number;
  wins: number;
  losses: number;
  calls: number;
}

/** A callout: "this coin, at this mcap, right now." */
export interface Call {
  id: string;
  callerId: string;
  tokenId: string;
  createdAt: number;
  /** Mcap at the moment the call was made. */
  entryMcap: number;
  thesis: string;
  verdict: Verdict;
  // Engagement counters (the ranking model's inputs).
  impressions: number;
  agrees: number;
  echoes: number;
  fades: number;
  /** SOL accrued so far by this call. */
  accruedSol: number;
  /** Resolved state once the scoring window closes. */
  outcome: "open" | "won" | "lost";
  /** Peak multiple reached since entry. */
  peakX: number;
}

export interface RankedCall {
  call: Call;
  rankScore: number;
  /** Per-component breakdown for the "why am I seeing this" panel. */
  breakdown: { label: string; value: number }[];
}
