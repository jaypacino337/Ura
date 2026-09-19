/** Ore grade revealed on each claim at settlement. */
export type Grade = "BARREN" | "TRACE" | "ORE" | "HIGH_GRADE" | "MOTHERLODE";

export interface Prospector {
  id: string;
  handle: string;
  isUser: boolean;
  hue: number;
  permits: number;
  /** Fictional in-game resource discovered by prospecting. */
  oreUnits: number;
  /** Lifetime ore — drives rank. */
  lifetimeOre: number;
  /** $USR game balance (sim). */
  usr: number;
  /** Reward payouts received, USDG-denominated (sim). */
  rewardsUsdg: number;
  strikes: number;
  claimsMade: number;
  equipmentTier: number;
}

export interface RoundResult {
  /** Index 0-24 of the strike (motherlode) plot. */
  strike: number;
  /** Grade per plot index. */
  grades: Grade[];
  /** Revealed seed — hash(round id + seed) must equal the commitment. */
  seed: string;
  payouts: { prospectorId: string; amountUsdg: number; ore: number; plot: number }[];
  /** Simulated settlement receipt hash. */
  txHash: string;
  /** Unclaimed tranches that rolled into the reserve. */
  rolledToReserve: number;
}

export interface Round {
  id: number;
  startedAt: number;
  locksAt: number;
  settlesAt: number;
  /** Published at round open; seed revealed at settlement. */
  commitment: string;
  poolUsdg: number;
  status: "open" | "locked" | "settled";
  /** claims[plot] = prospector ids staked on that plot. */
  claims: string[][];
  /** True-barren plot indices exposed to surveyors (equipment perk). */
  surveyHints: number[];
  result: RoundResult | null;
}

export type LedgerKind =
  | "fee_in"
  | "reserve_acq"
  | "reward_pool"
  | "ops"
  | "rollover"
  | "nne_acq";

export interface LedgerTx {
  t: number;
  kind: LedgerKind;
  asset: "USDG" | "ETH" | "NNE";
  amount: number;
  note: string;
  hash: string;
}

export interface Reserve {
  eth: number;
  usdg: number;
  nne: number;
  /** Tokenized physical uranium — PLANNED, always 0 in this build. */
  xu3o8: number;
  ledger: LedgerTx[];
}

export interface EquipmentTier {
  name: string;
  icon: string;
  costUsr: number;
  costOre: number;
  permitCap: number;
  permitsPerRound: number;
  /** Number of true-barren plots revealed each round. */
  surveyReveals: number;
}

export const EQUIPMENT: EquipmentTier[] = [
  { name: "Geiger Counter", icon: "☢", costUsr: 0, costOre: 0, permitCap: 6, permitsPerRound: 1, surveyReveals: 0 },
  { name: "Survey Truck", icon: "🚚", costUsr: 400, costOre: 40, permitCap: 8, permitsPerRound: 2, surveyReveals: 2 },
  { name: "Drill Rig", icon: "🛠", costUsr: 1200, costOre: 150, permitCap: 10, permitsPerRound: 2, surveyReveals: 4 },
  { name: "Mine Shaft", icon: "⛏", costUsr: 3000, costOre: 400, permitCap: 12, permitsPerRound: 3, surveyReveals: 6 },
  { name: "Processing Plant", icon: "🏭", costUsr: 8000, costOre: 1200, permitCap: 16, permitsPerRound: 4, surveyReveals: 8 },
  { name: "Reactor", icon: "⚛", costUsr: 20000, costOre: 3500, permitCap: 20, permitsPerRound: 5, surveyReveals: 10 },
];

export const RANKS: { name: string; ore: number }[] = [
  { name: "PROSPECTOR", ore: 0 },
  { name: "CLAIM OWNER", ore: 100 },
  { name: "MINE OPERATOR", ore: 500 },
  { name: "PROCESSOR", ore: 2_000 },
  { name: "REACTOR OPERATOR", ore: 8_000 },
  { name: "URANIUM BARON", ore: 25_000 },
];

export function rankOf(lifetimeOre: number) {
  let r = RANKS[0];
  let idx = 0;
  RANKS.forEach((rank, i) => {
    if (lifetimeOre >= rank.ore) {
      r = rank;
      idx = i;
    }
  });
  return { ...r, idx, next: RANKS[idx + 1] ?? null };
}

/** Payout tranches by grade — published rules, enforced in code. */
export const TRANCHES: { grade: Grade; count: number; share: number; orePerClaim: number }[] = [
  { grade: "MOTHERLODE", count: 1, share: 0.7, orePerClaim: 50 },
  { grade: "HIGH_GRADE", count: 2, share: 0.15, orePerClaim: 15 },
  { grade: "ORE", count: 3, share: 0.1, orePerClaim: 6 },
  { grade: "TRACE", count: 5, share: 0.05, orePerClaim: 1 },
];

export const GRID = 5;
export const PLOTS = GRID * GRID;

export function plotCode(i: number): string {
  return `${"ABCDE"[Math.floor(i / GRID)]}${(i % GRID) + 1}`;
}

/** Fee split — published before "launch", mirrored in the Strategy panel. */
export const FEE_SPLIT = {
  reserve: 0.55,
  rewards: 0.35,
  ops: 0.1,
};
