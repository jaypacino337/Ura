// Mirrors programs/ura-mine/src/constants.rs — keep in sync.

export const ONE_URA = 1_000_000_000n;
export const MAX_SUPPLY = 21_000_000n * ONE_URA;

export const MINE_COOLDOWN = 30; // seconds (on-chain)
export const STREAK_WINDOW = MINE_COOLDOWN * 4;

export const MIN_DIFFICULTY_FLOOR = 4;
export const MAX_DIFFICULTY_CEIL = 40;
export const MAX_BONUS_BITS = 10;

export const STAKE_BPS_PER_URA = 100n;
export const MAX_STAKE_BPS = 10_000n;
export const STREAK_BPS_PER_MINE = 50n;
export const MAX_STREAK_BPS = 2_500n;

// Demo mode is tuned to feel snappy in a browser (~100-500 kH/s in a worker).
export const DEMO = {
  minDifficulty: 16,
  cooldown: 15,
  epochDuration: 120,
  baseReward: ONE_URA / 100n, // 0.01 URA
  maxReward: 50n * ONE_URA,
  targetEpochRewards: 100n * ONE_URA,
};

export const PROGRAM_ID = "CXysNEonV32MZLLchUrAwFXbTnnXJSLaytVMbVXNkJRe";
export const DEVNET_RPC = "https://api.devnet.solana.com";

// Pickaxe tiers unlock as lifetime mined URA grows (base units).
export const PICKAXES: { name: string; icon: string; threshold: bigint }[] = [
  { name: "Rusty Pick", icon: "⛏️", threshold: 0n },
  { name: "Iron Pick", icon: "🪓", threshold: ONE_URA },
  { name: "Steel Drill", icon: "🔩", threshold: 10n * ONE_URA },
  { name: "Gold Excavator", icon: "🥇", threshold: 50n * ONE_URA },
  { name: "Diamond Bore", icon: "💎", threshold: 250n * ONE_URA },
  { name: "Quantum Laser", icon: "⚡", threshold: 1_000n * ONE_URA },
];

export function pickaxeFor(totalMined: bigint) {
  let tier = PICKAXES[0];
  let level = 0;
  for (let i = 0; i < PICKAXES.length; i++) {
    if (totalMined >= PICKAXES[i].threshold) {
      tier = PICKAXES[i];
      level = i;
    }
  }
  const next = PICKAXES[level + 1];
  return { ...tier, level, next };
}
