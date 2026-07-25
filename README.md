# ⛏️ URA Mine

**An Ore-style proof-of-work mining game on Solana.** Anyone can mine URA — a
hard-capped SPL token — by finding keccak256 hashes with enough leading zero
bits, straight from the browser. Deeper hashes pay exponentially more, staking
and streaks multiply rewards, and difficulty retargets every epoch to keep
emissions on schedule.

![URA Mine screenshot](docs/screenshot.png)

## How the game works

1. **Register** — opens a `Proof` account (PDA) and deals you a personal
   32-byte challenge no other miner shares.
2. **Mine** — your browser hashes `keccak256(challenge ‖ pubkey ‖ nonce)` in a
   WebWorker. Every extra leading-zero bit beyond the network minimum
   **doubles** the payout (capped at +10 bits). The client keeps the best hash
   found during the 30s cooldown window and submits it the moment the window
   opens — the same loop Ore uses.
3. **Claim** — unclaimed URA is minted to your wallet's token account.
4. **Boost** — stake URA for **+1% per whole URA staked (up to +100%)**, and
   keep rounds back-to-back for a streak bonus of **+0.5% per streak (up to
   +25%)**. Lifetime mining upgrades your pickaxe tier: Rusty Pick → Iron Pick
   → Steel Drill → Gold Excavator → Diamond Bore → Quantum Laser.

### Tokenomics

| Parameter | Value |
| --- | --- |
| Supply cap | 21,000,000 URA (accrual stops forever at the cap) |
| Decimals | 9 |
| Base reward | 0.01 URA at minimum difficulty (admin-tunable) |
| Max per solution | 50 URA after all multipliers |
| Cooldown | 30 s per miner |
| Epoch | 10 min — difficulty +1 if emissions ran hot, −1 if they ran cold |

## Repository layout

```
programs/ura-mine/   Anchor program (Rust) — PoW verification, emissions,
                     staking, epoch retargeting, SPL mint/treasury via PDAs
app/                 Vite + React game client — WebWorker miner, canvas
                     mining rig, wallet connect, leaderboard, vault
tests/               Anchor integration tests (mines a real solution in JS)
migrations/          Post-deploy hook that runs `initialize`
```

The web app has two modes:

- **Demo** (default) — the ledger is simulated in `localStorage`, but the
  proof-of-work is real: the same keccak256 difficulty check the program
  performs. Zero setup, instantly playable.
- **Devnet** — talks to the deployed program with a Phantom-compatible wallet.
  Instructions are hand-encoded against the Anchor ABI, so the client stays
  light.

## Run the game

```bash
cd app
npm install
npm run dev        # http://localhost:5173 — demo mode works immediately
```

## Build & deploy the program

Requires the [Solana toolchain](https://docs.solanalabs.com/cli/install) and
[Anchor 0.31](https://www.anchor-lang.com/docs/installation).

```bash
anchor keys sync   # generate your own program ID and patch declare_id!
anchor build
anchor test        # spins a local validator, mines a real solution
anchor deploy --provider.cluster devnet   # migrations/deploy.ts runs initialize
```

After deploying, update `PROGRAM_ID` in `app/src/game/constants.ts` with your
program ID and switch the in-app toggle to **Devnet**.

## On-chain design notes

- **Per-miner challenges.** Each accepted solution rotates the miner's
  challenge (`keccak(hash ‖ slot)`), so solutions can't be replayed, precomputed
  far ahead, or shared between miners.
- **Emission control.** Rewards accrue to the proof account and are only
  minted on claim. Accrual is bounded by the 21M cap, per-solution cap, and
  per-miner cooldown; epoch retargeting steers realized emissions toward the
  target rate.
- **PDA custody.** The mint authority and stake treasury are owned by the
  config PDA — no private key can ever mint URA or touch staked funds outside
  the program's rules.
- The game's difficulty metric (leading zero bits) and reward math are
  implemented identically in Rust (`programs/ura-mine`) and TypeScript
  (`app/src/game`), and the demo engine runs the exact same rules locally.

## Disclaimer

This is a game and a reference implementation. The program has not been
audited — deploy to mainnet at your own risk.
