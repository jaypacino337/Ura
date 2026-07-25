//! # URA Mine — a proof-of-work mining game on Solana
//!
//! Inspired by Ore: anyone can mine URA by finding a nonce such that
//! `keccak256(challenge ‖ authority ‖ nonce_le)` has at least
//! `min_difficulty` leading zero bits. Rewards double for every extra bit of
//! difficulty landed (capped), are boosted by staking URA and by keeping a
//! mining streak alive, and are throttled by a per-miner cooldown plus an
//! epoch-based difficulty retargeter that steers emissions toward a target.
//!
//! Flow: `initialize` (once) → `register` (per miner) → loop `mine` →
//! `claim` → optionally `stake`/`unstake` to boost future rewards.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

pub mod constants;
pub mod errors;
pub mod state;

use constants::*;
use errors::UraError;
use state::*;

declare_id!("CXysNEonV32MZLLchUrAwFXbTnnXJSLaytVMbVXNkJRe");

#[program]
pub mod ura_mine {
    use super::*;

    /// One-time deployment setup: creates the global config, the URA mint
    /// (mint authority = config PDA) and the stake treasury.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;

        config.admin = ctx.accounts.admin.key();
        config.mint = ctx.accounts.mint.key();
        config.challenge = keccak::hashv(&[
            b"ura.genesis",
            &ctx.accounts.admin.key().to_bytes(),
            &clock.slot.to_le_bytes(),
            &clock.unix_timestamp.to_le_bytes(),
        ])
        .0;
        config.min_difficulty = 12;
        config.base_reward = DEFAULT_BASE_REWARD;
        config.max_reward = DEFAULT_MAX_REWARD;
        config.epoch_rewards = 0;
        config.target_epoch_rewards = DEFAULT_TARGET_EPOCH_REWARDS;
        config.last_reset_at = clock.unix_timestamp;
        config.epoch_duration = DEFAULT_EPOCH_DURATION;
        config.total_miners = 0;
        config.total_mines = 0;
        config.total_rewards = 0;
        config.total_staked = 0;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Opens a proof account for the signer and deals them a unique first
    /// challenge derived from global entropy, their key and the current slot.
    pub fn register(ctx: Context<Register>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;
        let proof = &mut ctx.accounts.proof;

        proof.authority = ctx.accounts.authority.key();
        proof.challenge = keccak::hashv(&[
            &config.challenge,
            &ctx.accounts.authority.key().to_bytes(),
            &clock.slot.to_le_bytes(),
        ])
        .0;
        proof.balance = 0;
        proof.staked = 0;
        proof.last_mine_at = 0;
        proof.last_stake_at = 0;
        proof.total_mined = 0;
        proof.total_solutions = 0;
        proof.streak = 0;
        proof.best_difficulty = 0;
        proof.bump = ctx.bumps.proof;

        config.total_miners = config.total_miners.saturating_add(1);
        // Fold each registration into the global challenge so future
        // registrants can't predict their first challenge far in advance.
        config.challenge = keccak::hashv(&[
            &config.challenge,
            &proof.challenge,
        ])
        .0;
        Ok(())
    }

    /// Submits a proof-of-work solution. On success the reward is accrued to
    /// the proof's unclaimed balance and the miner's challenge rotates.
    pub fn mine(ctx: Context<MineCtx>, nonce: u64) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        let config = &mut ctx.accounts.config;
        let proof = &mut ctx.accounts.proof;

        require!(
            now >= proof.last_mine_at.saturating_add(MINE_COOLDOWN),
            UraError::CooldownActive
        );

        // Verify the solution against this miner's personal challenge.
        let hash = keccak::hashv(&[
            &proof.challenge,
            &proof.authority.to_bytes(),
            &nonce.to_le_bytes(),
        ]);
        let difficulty = leading_zero_bits(&hash.0);
        require!(
            difficulty >= config.min_difficulty,
            UraError::DifficultyNotMet
        );

        // Epoch rollover: retarget difficulty toward the emission target.
        if now >= config.last_reset_at.saturating_add(config.epoch_duration) {
            if config.epoch_rewards > config.target_epoch_rewards {
                config.min_difficulty =
                    config.min_difficulty.saturating_add(1).min(MAX_DIFFICULTY_CEIL);
            } else if config.epoch_rewards < config.target_epoch_rewards / 4 {
                config.min_difficulty =
                    config.min_difficulty.saturating_sub(1).max(MIN_DIFFICULTY_FLOOR);
            }
            config.epoch_rewards = 0;
            config.last_reset_at = now;
        }

        // Base payout doubles per extra bit of difficulty, capped.
        let bonus_bits = difficulty
            .saturating_sub(config.min_difficulty)
            .min(MAX_BONUS_BITS) as u32;
        let base = config
            .base_reward
            .saturating_mul(1u64.checked_shl(bonus_bits).unwrap_or(u64::MAX));

        // Streak: consecutive solutions landed inside the streak window.
        if proof.last_mine_at > 0
            && now <= proof.last_mine_at.saturating_add(STREAK_WINDOW)
        {
            proof.streak = proof.streak.saturating_add(1);
        } else {
            proof.streak = 1;
        }

        let stake_bps =
            (proof.staked / ONE_URA).saturating_mul(STAKE_BPS_PER_URA).min(MAX_STAKE_BPS);
        let streak_bps = (proof.streak as u64)
            .saturating_mul(STREAK_BPS_PER_MINE)
            .min(MAX_STREAK_BPS);
        let multiplier_bps = 10_000u64
            .saturating_add(stake_bps)
            .saturating_add(streak_bps);

        let mut reward = (base as u128)
            .saturating_mul(multiplier_bps as u128)
            .checked_div(10_000)
            .unwrap_or(0) as u64;
        reward = reward.min(config.max_reward);

        // Enforce the hard supply cap on accrual.
        let remaining = MAX_SUPPLY.saturating_sub(config.total_rewards);
        require!(remaining > 0, UraError::SupplyExhausted);
        reward = reward.min(remaining);

        proof.balance = proof.balance.saturating_add(reward);
        proof.total_mined = proof.total_mined.saturating_add(reward);
        proof.total_solutions = proof.total_solutions.saturating_add(1);
        proof.last_mine_at = now;
        proof.best_difficulty = proof.best_difficulty.max(difficulty);

        // Rotate the miner's challenge so this solution can never be reused.
        proof.challenge = keccak::hashv(&[
            &hash.0,
            &clock.slot.to_le_bytes(),
        ])
        .0;

        config.total_mines = config.total_mines.saturating_add(1);
        config.total_rewards = config.total_rewards.saturating_add(reward);
        config.epoch_rewards = config.epoch_rewards.saturating_add(reward);

        emit!(MineEvent {
            miner: proof.authority,
            difficulty,
            reward,
            streak: proof.streak,
            balance: proof.balance,
        });
        Ok(())
    }

    /// Mints unclaimed URA to the miner's associated token account.
    pub fn claim(ctx: Context<Claim>, amount: u64) -> Result<()> {
        require!(amount > 0, UraError::AmountZero);
        let proof = &mut ctx.accounts.proof;
        require!(amount <= proof.balance, UraError::InsufficientBalance);
        proof.balance -= amount;

        let bump = ctx.accounts.config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.beneficiary.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;
        Ok(())
    }

    /// Locks URA in the treasury to boost future mining rewards
    /// (+1% per whole URA staked, up to +100%).
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, UraError::AmountZero);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.source.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        let proof = &mut ctx.accounts.proof;
        proof.staked = proof.staked.saturating_add(amount);
        proof.last_stake_at = Clock::get()?.unix_timestamp;
        let config = &mut ctx.accounts.config;
        config.total_staked = config.total_staked.saturating_add(amount);
        Ok(())
    }

    /// Withdraws staked URA from the treasury back to the miner.
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        require!(amount > 0, UraError::AmountZero);
        let proof = &mut ctx.accounts.proof;
        require!(amount <= proof.staked, UraError::InsufficientStake);
        proof.staked -= amount;

        let bump = ctx.accounts.config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;
        let config = &mut ctx.accounts.config;
        config.total_staked = config.total_staked.saturating_sub(amount);
        Ok(())
    }

    /// Admin-only tuning of emission parameters.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        base_reward: Option<u64>,
        max_reward: Option<u64>,
        target_epoch_rewards: Option<u64>,
        epoch_duration: Option<i64>,
        min_difficulty: Option<u8>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(v) = base_reward {
            require!(v > 0, UraError::InvalidParameter);
            config.base_reward = v;
        }
        if let Some(v) = max_reward {
            require!(v >= config.base_reward, UraError::InvalidParameter);
            config.max_reward = v;
        }
        if let Some(v) = target_epoch_rewards {
            require!(v > 0, UraError::InvalidParameter);
            config.target_epoch_rewards = v;
        }
        if let Some(v) = epoch_duration {
            require!(v >= 60, UraError::InvalidParameter);
            config.epoch_duration = v;
        }
        if let Some(v) = min_difficulty {
            require!(
                (MIN_DIFFICULTY_FLOOR..=MAX_DIFFICULTY_CEIL).contains(&v),
                UraError::InvalidParameter
            );
            config.min_difficulty = v;
        }
        Ok(())
    }
}

/// Number of leading zero bits in a 256-bit hash — the game's difficulty
/// metric, identical to the client's WebWorker implementation.
pub fn leading_zero_bits(hash: &[u8; 32]) -> u8 {
    let mut count: u32 = 0;
    for byte in hash {
        if *byte == 0 {
            count += 8;
        } else {
            count += byte.leading_zeros();
            break;
        }
    }
    count.min(u8::MAX as u32) as u8
}

#[event]
pub struct MineEvent {
    pub miner: Pubkey,
    pub difficulty: u8,
    pub reward: u64,
    pub streak: u32,
    pub balance: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        seeds = [MINT_SEED],
        bump,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = config,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        seeds = [TREASURY_SEED],
        bump,
        token::mint = mint,
        token::authority = config,
    )]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Register<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + Proof::INIT_SPACE,
        seeds = [PROOF_SEED, authority.key().as_ref()],
        bump
    )]
    pub proof: Account<'info, Proof>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MineCtx<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [PROOF_SEED, authority.key().as_ref()],
        bump = proof.bump,
        has_one = authority
    )]
    pub proof: Account<'info, Proof>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [PROOF_SEED, authority.key().as_ref()],
        bump = proof.bump,
        has_one = authority
    )]
    pub proof: Account<'info, Proof>,
    #[account(mut, seeds = [MINT_SEED], bump)]
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub beneficiary: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [PROOF_SEED, authority.key().as_ref()],
        bump = proof.bump,
        has_one = authority
    )]
    pub proof: Account<'info, Proof>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = authority,
    )]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [PROOF_SEED, authority.key().as_ref()],
        bump = proof.bump,
        has_one = authority
    )]
    pub proof: Account<'info, Proof>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = authority,
    )]
    pub destination: Account<'info, TokenAccount>,
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ UraError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_leading_zero_bits() {
        assert_eq!(leading_zero_bits(&[0xff; 32]), 0);
        assert_eq!(leading_zero_bits(&[0x00; 32]), u8::MAX);
        let mut h = [0u8; 32];
        h[0] = 0b0000_1000;
        assert_eq!(leading_zero_bits(&h), 4);
        let mut h2 = [0u8; 32];
        h2[0] = 0;
        h2[1] = 0b0100_0000;
        assert_eq!(leading_zero_bits(&h2), 9);
    }
}
