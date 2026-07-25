use anchor_lang::prelude::*;

#[error_code]
pub enum UraError {
    #[msg("The submitted hash does not meet the current difficulty")]
    DifficultyNotMet,
    #[msg("Cooldown has not elapsed since the last accepted solution")]
    CooldownActive,
    #[msg("Claim amount exceeds unclaimed balance")]
    InsufficientBalance,
    #[msg("Stake amount exceeds staked balance")]
    InsufficientStake,
    #[msg("The maximum token supply has been fully mined")]
    SupplyExhausted,
    #[msg("Amount must be greater than zero")]
    AmountZero,
    #[msg("Only the admin may perform this action")]
    Unauthorized,
    #[msg("Parameter out of allowed range")]
    InvalidParameter,
}
