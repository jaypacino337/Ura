// The world: one live prospecting round at a time, a reserve that grows from
// disclosed (simulated) creator fees, bot prospectors, and the user's mining
// operation. All round outcomes come from src/engine/det.ts (commit-reveal),
// so nothing in here can steer a settlement.

import {
  commitmentFor,
  deriveGrades,
  deriveSurveyables,
  hashHex,
  randomSeed,
  receiptHash,
} from "./det";
import {
  EQUIPMENT,
  FEE_SPLIT,
  PLOTS,
  TRANCHES,
  type LedgerTx,
  type Prospector,
  type Reserve,
  type Round,
  type RoundResult,
} from "./types";

export const ROUND_OPEN_MS = 70_000;
export const ROUND_LOCK_MS = 8_000; // claims frozen before settlement
export const ROUND_SETTLED_MS = 10_000; // reveal display before next round

const BOTS: string[] = [
  "atomic_annie",
  "yellowcake_yuri",
  "geiger_gary",
  "dosimeter_dan",
  "fissile_frank",
  "breeder_beth",
  "centrifuge_sal",
  "halflife_hank",
  "cherenkov_chad",
  "oklo_operator",
  "rad_roughneck",
  "borehole_bob",
  "tailings_tina",
  "critical_carl",
];

function mulberry32(seedNum: number) {
  let a = seedNum >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface World {
  round: Round;
  history: Round[];
  prospectors: Map<string, Prospector>;
  user: Prospector;
  reserve: Reserve;
  ethPrice: number;
  nnePrice: number;
  usrPrice: number;
  oreDiscovered: number;
  feesToOps: number;
  nextPoolUsdg: number;
  cpm: number; // geiger counter, cosmetic
}

interface PendingRound {
  seed: string;
}

class Store {
  private rng = mulberry32(Date.now() ^ 0xf1551e);
  private world: World;
  private pending: PendingRound;
  private listeners = new Set<() => void>();
  private snapshot: { version: number; world: World };
  private version = 0;
  private timer: number | null = null;
  private roundSeq: number;

  constructor() {
    this.roundSeq = 140 + Math.floor(this.rng() * 20);
    const { world, pending } = this.boot();
    this.world = world;
    this.pending = pending;
    this.snapshot = { version: 0, world };
  }

  private makeProspector(handle: string, i: number, isUser = false): Prospector {
    return {
      id: isUser ? "you" : `bot-${handle}`,
      handle,
      isUser,
      hue: isUser ? 52 : (i * 41 + 90) % 360,
      permits: isUser ? 6 : 99,
      oreUnits: 0,
      lifetimeOre: 0,
      usr: isUser ? 2_500 : 0,
      rewardsUsdg: 0,
      strikes: 0,
      claimsMade: 0,
      equipmentTier: 0,
    };
  }

  private newRound(now: number, poolUsdg: number): { round: Round; pending: PendingRound } {
    const seed = randomSeed();
    const id = ++this.roundSeq;
    const round: Round = {
      id,
      startedAt: now,
      locksAt: now + ROUND_OPEN_MS,
      settlesAt: now + ROUND_OPEN_MS + ROUND_LOCK_MS,
      commitment: commitmentFor(id, seed),
      poolUsdg,
      status: "open",
      claims: Array.from({ length: PLOTS }, () => []),
      surveyHints: [],
      result: null,
    };
    return { round, pending: { seed } };
  }

  private boot() {
    const now = Date.now();
    const prospectors = new Map<string, Prospector>();
    BOTS.forEach((h, i) => {
      const p = this.makeProspector(h, i);
      prospectors.set(p.id, p);
    });
    const user = this.makeProspector("you", 0, true);
    prospectors.set(user.id, user);

    const reserve: Reserve = { eth: 0, usdg: 0, nne: 0, xu3o8: 0, ledger: [] };
    const world: World = {
      round: null as unknown as Round,
      history: [],
      prospectors,
      user,
      reserve,
      ethPrice: 3_200 + this.rng() * 900,
      nnePrice: 28 + this.rng() * 14,
      usrPrice: 0.004 + this.rng() * 0.004,
      oreDiscovered: 0,
      feesToOps: 0,
      nextPoolUsdg: 0,
      cpm: 22,
    };

    // Pre-run settled rounds so the terminal boots with a history, a funded
    // reserve, and bots with records — every past round fully verifiable.
    const PRE = 9;
    for (let k = 0; k < PRE; k++) {
      const t = now - (PRE - k) * (ROUND_OPEN_MS + ROUND_LOCK_MS + ROUND_SETTLED_MS);
      this.ingestFees(world, t);
      const { round, pending } = this.newRound(t, world.nextPoolUsdg);
      world.nextPoolUsdg = 0;
      this.botClaims(round, world, 1);
      this.settle(round, pending.seed, world, t + ROUND_OPEN_MS + ROUND_LOCK_MS);
      world.history.unshift(round);
    }

    this.ingestFees(world, now);
    const fresh = this.newRound(now, world.nextPoolUsdg);
    world.nextPoolUsdg = 0;
    world.round = fresh.round;
    this.applySurveyHints(world, fresh.pending.seed);
    return { world, pending: fresh.pending };
  }

  /** Simulated Pons creator-fee inflow, split per the published schedule. */
  private ingestFees(world: World, t: number) {
    const gross = 180 + this.rng() * 420; // USDG per round, sim
    const toReserve = gross * FEE_SPLIT.reserve;
    const toRewards = gross * FEE_SPLIT.rewards;
    const toOps = gross * FEE_SPLIT.ops;

    // Reserve acquisition alternates USDG / ETH, tiny periodic NNE adds.
    const asEth = this.rng() < 0.4;
    const push = (tx: Omit<LedgerTx, "hash">) =>
      world.reserve.ledger.unshift({
        ...tx,
        hash: `0x${hashHex(`${tx.t}:${tx.kind}:${tx.amount}`).slice(0, 40)}`,
      });

    push({ t, kind: "fee_in", asset: "USDG", amount: gross, note: "creator fees (sim)" });
    if (asEth) {
      const eth = toReserve / world.ethPrice;
      world.reserve.eth += eth;
      push({ t, kind: "reserve_acq", asset: "ETH", amount: eth, note: "reserve acquisition" });
    } else {
      world.reserve.usdg += toReserve;
      push({ t, kind: "reserve_acq", asset: "USDG", amount: toReserve, note: "reserve acquisition" });
    }
    if (this.rng() < 0.18) {
      const spend = Math.min(world.reserve.usdg * 0.1, 120);
      if (spend > 10) {
        world.reserve.usdg -= spend;
        const nne = spend / world.nnePrice;
        world.reserve.nne += nne;
        push({ t, kind: "nne_acq", asset: "NNE", amount: nne, note: "nuclear-sector exposure" });
      }
    }
    world.nextPoolUsdg += toRewards;
    world.feesToOps += toOps;
    push({ t, kind: "reward_pool", asset: "USDG", amount: toRewards, note: "mining reward pool" });
  }

  private applySurveyHints(world: World, seed: string) {
    const tier = EQUIPMENT[world.user.equipmentTier];
    if (tier.surveyReveals > 0) {
      world.round.surveyHints = deriveSurveyables(seed).slice(0, tier.surveyReveals);
    }
  }

  /** Bots stake claims over the open window (or instantly during preroll). */
  private botClaims(round: Round, world: World, instantAll: number) {
    const bots = [...world.prospectors.values()].filter((p) => !p.isUser);
    for (const bot of bots) {
      if (instantAll < 1 && this.rng() > instantAll) continue;
      const n = 1 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        const plot = Math.floor(this.rng() * PLOTS);
        if (!round.claims[plot].includes(bot.id)) {
          round.claims[plot].push(bot.id);
          bot.claimsMade++;
        }
      }
    }
  }

  private settle(round: Round, seed: string, world: World, t: number) {
    const { strike, grades } = deriveGrades(seed);
    const payouts: RoundResult["payouts"] = [];
    let paidTotal = 0;

    for (const tranche of TRANCHES) {
      const plots = grades
        .map((g, i) => (g === tranche.grade ? i : -1))
        .filter((i) => i >= 0);
      const claimants = plots.flatMap((p) =>
        round.claims[p].map((id) => ({ id, plot: p }))
      );
      const trancheUsdg = round.poolUsdg * tranche.share;
      if (claimants.length === 0) continue;
      const each = trancheUsdg / claimants.length;
      for (const { id, plot } of claimants) {
        const p = world.prospectors.get(id);
        if (!p) continue;
        p.rewardsUsdg += each;
        p.oreUnits += tranche.orePerClaim;
        p.lifetimeOre += tranche.orePerClaim;
        world.oreDiscovered += tranche.orePerClaim;
        if (tranche.grade === "MOTHERLODE") p.strikes++;
        payouts.push({ prospectorId: id, amountUsdg: each, ore: tranche.orePerClaim, plot });
        paidTotal += each;
      }
    }

    const rolled = Math.max(round.poolUsdg - paidTotal, 0);
    if (rolled > 0.01) {
      world.reserve.usdg += rolled;
      world.reserve.ledger.unshift({
        t,
        kind: "rollover",
        asset: "USDG",
        amount: rolled,
        note: `round #${round.id} unclaimed tranches → reserve`,
        hash: `0x${hashHex(`${round.id}:rollover`).slice(0, 40)}`,
      });
    }

    round.status = "settled";
    round.result = {
      strike,
      grades,
      seed,
      payouts,
      txHash: receiptHash(seed),
      rolledToReserve: rolled,
    };
  }

  start() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  private tick() {
    const w = this.world;
    const now = Date.now();
    const r = w.round;

    // Prices drift.
    w.ethPrice *= 1 + (this.rng() - 0.5) * 0.004;
    w.nnePrice *= 1 + (this.rng() - 0.5) * 0.008;
    w.usrPrice *= 1 + (this.rng() - 0.5) * 0.02;

    // Geiger: ambient jitter, hot as settlement approaches.
    const toSettle = Math.max(r.settlesAt - now, 0);
    const heat = toSettle < 15_000 ? (15_000 - toSettle) / 15_000 : 0;
    w.cpm = Math.round(18 + this.rng() * 14 + heat * (160 + this.rng() * 120));

    if (r.status === "open") {
      // Bots trickle claims in.
      if (this.rng() < 0.5) this.botClaims(r, w, 0.12);
      if (now >= r.locksAt) r.status = "locked";
    }
    if (r.status === "locked" && now >= r.settlesAt) {
      this.settle(r, this.pending.seed, w, now);
    }
    if (r.status === "settled" && now >= r.settlesAt + ROUND_SETTLED_MS) {
      w.history.unshift(r);
      if (w.history.length > 30) w.history.pop();
      this.ingestFees(w, now);
      // Permit regeneration by equipment tier.
      const tier = EQUIPMENT[w.user.equipmentTier];
      w.user.permits = Math.min(w.user.permits + tier.permitsPerRound, tier.permitCap);
      const fresh = this.newRound(now, w.nextPoolUsdg);
      w.nextPoolUsdg = 0;
      w.round = fresh.round;
      this.pending = fresh.pending;
      this.applySurveyHints(w, fresh.pending.seed);
    }

    this.emit();
  }

  /** User stakes a prospecting permit on a plot. */
  stakeClaim(plot: number): string | null {
    const w = this.world;
    const r = w.round;
    if (r.status !== "open") return "Claims are locked for settlement.";
    if (w.user.permits <= 0) return "No prospecting permits left — they regenerate each round.";
    if (r.claims[plot].includes("you")) return "You already hold this claim.";
    w.user.permits--;
    w.user.claimsMade++;
    r.claims[plot].push("you");
    this.emit();
    return null;
  }

  /** Refine ore units into $USR (10 ore → 24 USR, sim rate). */
  refine(): string | null {
    const u = this.world.user;
    if (u.oreUnits < 10) return "Need at least 10 ore units to refine.";
    const batches = Math.floor(u.oreUnits / 10);
    u.oreUnits -= batches * 10;
    u.usr += batches * 24;
    this.emit();
    return null;
  }

  upgrade(): string | null {
    const u = this.world.user;
    const next = EQUIPMENT[u.equipmentTier + 1];
    if (!next) return "Operation fully upgraded.";
    if (u.usr < next.costUsr || u.oreUnits < next.costOre)
      return `Needs ${next.costUsr} USR + ${next.costOre} ore.`;
    u.usr -= next.costUsr;
    u.oreUnits -= next.costOre;
    u.equipmentTier++;
    // New survey gear applies from the current round if still open.
    if (this.world.round.status === "open") {
      this.applySurveyHints(this.world, this.pending.seed);
    }
    this.emit();
    return null;
  }

  private emit() {
    this.version++;
    this.snapshot = { version: this.version, world: this.world };
    for (const l of this.listeners) l();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snapshot;
}

export const store = new Store();
