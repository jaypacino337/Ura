# ☢ URANIUM STRATEGY RESERVE · $USR

**Mine uranium. Build the reserve.**

A uranium strategy with an onchain prospecting game underneath it. Every
round presents a 5×5 uranium field — 25 claims, one strike. Prospectors
stake free permits on plots; at settlement, verifiable randomness selects
the deposit and the round's reward pool pays out by published rules, while
disclosed creator revenue grows a transparent reserve.

![USR terminal](docs/screenshot.png)

## The game

- A round opens (~70s). Players stake **prospecting permits** on any of the
  25 claims. Permits are **free and regenerate every round** — no deposits
  buy entries in this build (paid entry is a compliance project, not an MVP
  feature).
- Claims lock, then the round settles. One plot is the **☢ MOTHERLODE**
  (strike); the seed also places 2 HIGH-GRADE, 3 ORE and 5 TRACE plots.
- Payout tranches (published, enforced in code): **70 / 15 / 10 / 5%** of
  the pool to Motherlode / High-grade / Ore / Trace claimants. Unclaimed
  tranches roll into the reserve.
- Strikes yield **ore units** — refine them into $USR, buy equipment
  (Geiger Counter → Survey Truck → Drill Rig → Mine Shaft → Processing
  Plant → Reactor) for more permits and survey intel, and climb the ranks:
  PROSPECTOR → CLAIM OWNER → MINE OPERATOR → PROCESSOR → REACTOR OPERATOR →
  URANIUM BARON.

## Auditable randomness

Commit-reveal over sha-256 (`src/engine/det.ts`):

```
round open:   commitment = sha256(roundId:seed) published on the terminal
settlement:   seed revealed
anyone:       strike, full grade layout and the settlement receipt are pure
              functions of the seed — the "verify" button recomputes all of
              it in your browser
```

The production path swaps this for onchain VRF + real settlement
transactions; the derivation functions stay identical.

## The reserve

Simulated creator fees flow through a **published split** every round:

| Destination | Share |
| --- | --- |
| Reserve acquisition (USDG / ETH, periodic NNE exposure) | 55% |
| Mining reward pool | 35% |
| Development / operations | 10% |

Every inflow appears in the reserve ledger with a receipt hash. The vault
shows **USDG · ETH · NNE** as LIVE and **xU3O8** (tokenized U₃O₈) as
PLANNED — it requires custody whitelist approval, so it is tracked as a
roadmap milestone and never simulated as held. **No physical backing is
claimed.** "USR acquires its first real onchain uranium" is designed to be
a future, provable event.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
```

Boots into a live field terminal: funded reserve, round history (each one
verifiable), bots prospecting, and a fresh round counting down.

## Wiring it to Pons (the seams)

- `src/engine/store.ts → ingestFees()` — replace the simulated fee stream
  with the live Pons creator-fee feed ($USR/ETH pair).
- `src/engine/det.ts` — swap `randomSeed`/commit-reveal for the onchain VRF
  and post real settlement txs.
- `src/engine/types.ts → FEE_SPLIT, TRANCHES` — the published economics,
  one place.
- Reserve panel reads a wallet instead of the sim ledger; xU3O8 flips from
  PLANNED to LIVE only when the whitelist path is solved.

## Status

| Feature | Status |
| --- | --- |
| 5×5 prospecting rounds, commit-reveal randomness | LIVE (sim) |
| Free permits, equipment, refining, ranks | LIVE (sim) |
| Reserve dashboard + ledger (USDG/ETH/NNE) | LIVE (sim) |
| Pons launch, live fee feed, onchain VRF | PLANNED |
| xU3O8 reserve holdings | PLANNED (whitelist) |
| USR / NNE pairing | PLANNED (liquidity permitting) |
