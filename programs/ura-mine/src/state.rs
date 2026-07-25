use anchor_lang::prelude::*;

/// Global game state. One per deployment, PDA of ["config"].
///
/// Field order is part of the wire format — the web app decodes these
/// accounts by offset. Do not reorder without updating `app/src/chain/layout.ts`.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Can tune emission parameters via `update_config`.
    pub admin: Pubkey,
    /// The URA SPL mint. Mint authority is the config PDA itself.
    pub mint: Pubkey,
    /// Global entropy folded into every fresh proof's first challenge.
    pub challenge: [u8; 32],
    /// Current minimum difficulty (leading zero bits) for a valid solution.
    pub min_difficulty: u8,
    /// Payout for a solution at exactly `min_difficulty`, before multipliers.
    pub base_reward: u64,
    /// Hard cap for a single solution's payout after multipliers.
    pub max_reward: u64,
    /// URA accrued during the current epoch (drives retargeting).
    pub epoch_rewards: u64,
    /// Emission target per epoch; retargeter steers `min_difficulty` toward it.
    pub target_epoch_rewards: u64,
    /// Unix time the current epoch started.
    pub last_reset_at: i64,
    /// Epoch length in seconds.
    pub epoch_duration: i64,
    /// Lifetime counters (leaderboard / stats).
    pub total_miners: u64,
    pub total_mines: u64,
    /// Total URA ever accrued (claimed or not). Bounded by MAX_SUPPLY.
    pub total_rewards: u64,
    /// Total URA currently staked in the treasury.
    pub total_staked: u64,
    pub bump: u8,
}

/// Per-miner state. PDA of ["proof", authority].
#[account]
#[derive(InitSpace)]
pub struct Proof {
    pub authority: Pubkey,
    /// The challenge this miner must solve next. Rotates on every accepted
    /// solution, so solutions can never be replayed or shared between miners.
    pub challenge: [u8; 32],
    /// Accrued but unclaimed URA.
    pub balance: u64,
    /// URA staked for the reward multiplier.
    pub staked: u64,
    pub last_mine_at: i64,
    pub last_stake_at: i64,
    /// Lifetime URA accrued by this miner.
    pub total_mined: u64,
    /// Lifetime accepted solutions.
    pub total_solutions: u64,
    /// Consecutive on-time solutions.
    pub streak: u32,
    /// Best difficulty this miner has ever landed.
    pub best_difficulty: u8,
    pub bump: u8,
}
