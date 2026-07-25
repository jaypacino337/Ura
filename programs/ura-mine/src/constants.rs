//! Game-tuning constants. Every value that shapes the emission curve or the
//! player experience lives here so the numbers can be audited in one place.

/// One whole URA in base units (9 decimals, like SOL's lamports).
pub const ONE_URA: u64 = 1_000_000_000;

/// Hard supply cap: 21,000,000 URA. Accrual stops forever once reached.
pub const MAX_SUPPLY: u64 = 21_000_000 * ONE_URA;

/// Seconds a miner must wait between accepted solutions.
pub const MINE_COOLDOWN: i64 = 30;

/// A solution submitted within this window after the cooldown ends keeps the
/// miner's streak alive; arriving later resets the streak to 1.
pub const STREAK_WINDOW: i64 = MINE_COOLDOWN * 4;

/// Difficulty (leading zero bits of the keccak hash) can never drop below this.
pub const MIN_DIFFICULTY_FLOOR: u8 = 4;

/// ...and never rise above this (256-bit hash).
pub const MAX_DIFFICULTY_CEIL: u8 = 40;

/// Extra difficulty beyond the minimum doubles the reward, but the doubling is
/// capped at this many bits so a lucky hash can't drain an epoch.
pub const MAX_BONUS_BITS: u8 = 10;

/// Each whole URA staked adds 1% (100 bps) to rewards, up to +100%.
pub const STAKE_BPS_PER_URA: u64 = 100;
pub const MAX_STAKE_BPS: u64 = 10_000;

/// Each consecutive mine adds 50 bps to rewards, up to +25%.
pub const STREAK_BPS_PER_MINE: u64 = 50;
pub const MAX_STREAK_BPS: u64 = 2_500;

/// Default epoch length for emission targeting / difficulty retargeting.
pub const DEFAULT_EPOCH_DURATION: i64 = 600; // 10 minutes

/// Default base reward for a minimum-difficulty solution.
pub const DEFAULT_BASE_REWARD: u64 = ONE_URA / 100; // 0.01 URA

/// Default cap on a single solution's payout (after all multipliers).
pub const DEFAULT_MAX_REWARD: u64 = 50 * ONE_URA;

/// Default emission target per epoch; the retargeter steers toward this.
pub const DEFAULT_TARGET_EPOCH_REWARDS: u64 = 100 * ONE_URA;

pub const CONFIG_SEED: &[u8] = b"config";
pub const MINT_SEED: &[u8] = b"mint";
pub const PROOF_SEED: &[u8] = b"proof";
pub const TREASURY_SEED: &[u8] = b"treasury";

pub const TOKEN_DECIMALS: u8 = 9;
