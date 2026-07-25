import {
  MAX_BONUS_BITS,
  MAX_STAKE_BPS,
  MAX_STREAK_BPS,
  ONE_URA,
  STAKE_BPS_PER_URA,
  STREAK_BPS_PER_MINE,
} from "./constants";

/**
 * Reward formula, mirroring the on-chain program exactly:
 * base doubles per extra difficulty bit (capped), then stake and streak
 * multipliers are applied in basis points, then the per-mine cap.
 */
export function computeReward(params: {
  difficulty: number;
  minDifficulty: number;
  baseReward: bigint;
  maxReward: bigint;
  staked: bigint;
  streak: number;
}): bigint {
  const bonusBits = BigInt(
    Math.min(params.difficulty - params.minDifficulty, MAX_BONUS_BITS)
  );
  const base = params.baseReward << bonusBits;
  const stakeBps = min(
    (params.staked / ONE_URA) * STAKE_BPS_PER_URA,
    MAX_STAKE_BPS
  );
  const streakBps = min(
    BigInt(params.streak) * STREAK_BPS_PER_MINE,
    MAX_STREAK_BPS
  );
  const reward = (base * (10_000n + stakeBps + streakBps)) / 10_000n;
  return reward > params.maxReward ? params.maxReward : reward;
}

export function multiplierBps(staked: bigint, streak: number): bigint {
  const stakeBps = min((staked / ONE_URA) * STAKE_BPS_PER_URA, MAX_STAKE_BPS);
  const streakBps = min(BigInt(streak) * STREAK_BPS_PER_MINE, MAX_STREAK_BPS);
  return 10_000n + stakeBps + streakBps;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
