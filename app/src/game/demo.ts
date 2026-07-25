// Fully-simulated backend so the game is playable with zero setup. The PoW is
// real (same keccak difficulty check as the program); only the ledger is local.

import { keccak_256 } from "@noble/hashes/sha3";
import { DEMO, MAX_SUPPLY, MIN_DIFFICULTY_FLOOR, ONE_URA } from "./constants";
import { leadingZeroBits, mineHash } from "./pow";
import { computeReward } from "./rewards";
import { encodeBase58 } from "../lib/base58";
import type {
  ConfigState,
  GameBackend,
  LeaderboardEntry,
  MineResult,
  ProofState,
} from "./types";

const STORAGE_KEY = "ura.demo.v2";

interface DemoSave {
  authorityHex: string;
  createdAt: number;
  registered: boolean;
  challengeHex: string;
  globalChallengeHex: string;
  balance: string;
  staked: string;
  walletUra: string;
  lastMineAt: number;
  totalMined: string;
  totalSolutions: string;
  streak: number;
  bestDifficulty: number;
  minDifficulty: number;
  epochRewards: string;
  lastResetAt: number;
  totalMines: string;
  totalRewards: string;
}

const BOTS: { name: string; ratePerHour: bigint }[] = [
  { name: "DrillSgt.sol", ratePerHour: 42n * ONE_URA },
  { name: "HashHermit", ratePerHour: 31n * ONE_URA },
  { name: "NoncePirate", ratePerHour: 27n * ONE_URA },
  { name: "GigaMiner", ratePerHour: 19n * ONE_URA },
  { name: "ore4breakfast", ratePerHour: 12n * ONE_URA },
  { name: "PickaxePete", ratePerHour: 8n * ONE_URA },
  { name: "sleepy_keccak", ratePerHour: 5n * ONE_URA },
  { name: "dustCollector", ratePerHour: 2n * ONE_URA },
];

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) =>
  new Uint8Array(s.match(/.{2}/g)!.map((x) => parseInt(x, 16)));

function freshSave(): DemoSave {
  const authority = randomBytes(32);
  return {
    authorityHex: hex(authority),
    createdAt: Date.now(),
    registered: false,
    challengeHex: hex(randomBytes(32)),
    globalChallengeHex: hex(randomBytes(32)),
    balance: "0",
    staked: "0",
    walletUra: "0",
    lastMineAt: 0,
    totalMined: "0",
    totalSolutions: "0",
    streak: 0,
    bestDifficulty: 0,
    minDifficulty: DEMO.minDifficulty,
    epochRewards: "0",
    lastResetAt: Math.floor(Date.now() / 1000),
    totalMines: "0",
    totalRewards: "0",
  };
}

export class DemoBackend implements GameBackend {
  readonly mode = "demo" as const;
  private save: DemoSave;

  constructor() {
    const raw = localStorage.getItem(STORAGE_KEY);
    this.save = raw ? { ...freshSave(), ...JSON.parse(raw) } : freshSave();
    this.persist();
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.save));
  }

  address(): string {
    return encodeBase58(unhex(this.save.authorityHex));
  }

  authorityBytes(): Uint8Array {
    return unhex(this.save.authorityHex);
  }

  async connect(): Promise<string> {
    return this.address();
  }

  cooldown(): number {
    return DEMO.cooldown;
  }

  async getConfig(): Promise<ConfigState> {
    return {
      challenge: unhex(this.save.globalChallengeHex),
      minDifficulty: this.save.minDifficulty,
      baseReward: DEMO.baseReward,
      maxReward: DEMO.maxReward,
      epochRewards: BigInt(this.save.epochRewards),
      targetEpochRewards: DEMO.targetEpochRewards,
      lastResetAt: this.save.lastResetAt,
      epochDuration: DEMO.epochDuration,
      totalMiners: BigInt(BOTS.length + 1),
      totalMines: BigInt(this.save.totalMines),
      totalRewards: this.botTotal() + BigInt(this.save.totalRewards),
      totalStaked: BigInt(this.save.staked),
    };
  }

  async getProof(): Promise<ProofState | null> {
    if (!this.save.registered) return null;
    return {
      authority: this.address(),
      challenge: unhex(this.save.challengeHex),
      balance: BigInt(this.save.balance),
      staked: BigInt(this.save.staked),
      lastMineAt: this.save.lastMineAt,
      totalMined: BigInt(this.save.totalMined),
      totalSolutions: BigInt(this.save.totalSolutions),
      streak: this.save.streak,
      bestDifficulty: this.save.bestDifficulty,
    };
  }

  async register(): Promise<void> {
    if (this.save.registered) return;
    this.save.registered = true;
    this.save.challengeHex = hex(
      keccak_256(
        new Uint8Array([
          ...unhex(this.save.globalChallengeHex),
          ...this.authorityBytes(),
        ])
      )
    );
    this.persist();
  }

  async submitSolution(nonce: bigint): Promise<MineResult> {
    const now = Math.floor(Date.now() / 1000);
    if (now < this.save.lastMineAt + DEMO.cooldown) {
      throw new Error("Cooldown active — the drill needs to cool off.");
    }
    const challenge = unhex(this.save.challengeHex);
    const hash = mineHash(challenge, this.authorityBytes(), nonce);
    const difficulty = leadingZeroBits(hash);
    if (difficulty < this.save.minDifficulty) {
      throw new Error("Solution below current difficulty.");
    }

    // Epoch retargeting, same rules as the on-chain program.
    if (now >= this.save.lastResetAt + DEMO.epochDuration) {
      const epoch = BigInt(this.save.epochRewards);
      if (epoch > DEMO.targetEpochRewards) {
        this.save.minDifficulty = Math.min(this.save.minDifficulty + 1, 40);
      } else if (epoch < DEMO.targetEpochRewards / 4n) {
        this.save.minDifficulty = Math.max(
          this.save.minDifficulty - 1,
          MIN_DIFFICULTY_FLOOR
        );
      }
      this.save.epochRewards = "0";
      this.save.lastResetAt = now;
    }

    const onStreak =
      this.save.lastMineAt > 0 &&
      now <= this.save.lastMineAt + DEMO.cooldown * 4;
    this.save.streak = onStreak ? this.save.streak + 1 : 1;

    let reward = computeReward({
      difficulty,
      minDifficulty: this.save.minDifficulty,
      baseReward: DEMO.baseReward,
      maxReward: DEMO.maxReward,
      staked: BigInt(this.save.staked),
      streak: this.save.streak,
    });
    const remaining = MAX_SUPPLY - BigInt(this.save.totalRewards);
    if (remaining <= 0n) throw new Error("Max supply mined!");
    if (reward > remaining) reward = remaining;

    this.save.balance = (BigInt(this.save.balance) + reward).toString();
    this.save.totalMined = (BigInt(this.save.totalMined) + reward).toString();
    this.save.totalSolutions = (
      BigInt(this.save.totalSolutions) + 1n
    ).toString();
    this.save.totalRewards = (BigInt(this.save.totalRewards) + reward).toString();
    this.save.epochRewards = (BigInt(this.save.epochRewards) + reward).toString();
    this.save.totalMines = (BigInt(this.save.totalMines) + 1n).toString();
    this.save.lastMineAt = now;
    this.save.bestDifficulty = Math.max(this.save.bestDifficulty, difficulty);
    // Rotate the challenge exactly like the program does.
    this.save.challengeHex = hex(
      keccak_256(new Uint8Array([...hash, ...randomBytes(8)]))
    );
    this.persist();
    return { reward, difficulty, streak: this.save.streak };
  }

  async claim(amount: bigint): Promise<void> {
    const bal = BigInt(this.save.balance);
    if (amount <= 0n || amount > bal) throw new Error("Invalid claim amount");
    this.save.balance = (bal - amount).toString();
    this.save.walletUra = (BigInt(this.save.walletUra) + amount).toString();
    this.persist();
  }

  async stake(amount: bigint): Promise<void> {
    const wallet = BigInt(this.save.walletUra);
    if (amount <= 0n || amount > wallet) throw new Error("Not enough URA in wallet");
    this.save.walletUra = (wallet - amount).toString();
    this.save.staked = (BigInt(this.save.staked) + amount).toString();
    this.persist();
  }

  async unstake(amount: bigint): Promise<void> {
    const staked = BigInt(this.save.staked);
    if (amount <= 0n || amount > staked) throw new Error("Not enough staked");
    this.save.staked = (staked - amount).toString();
    this.save.walletUra = (BigInt(this.save.walletUra) + amount).toString();
    this.persist();
  }

  async walletBalance(): Promise<bigint> {
    return BigInt(this.save.walletUra);
  }

  private botTotal(): bigint {
    const hours = BigInt(
      Math.floor((Date.now() - this.save.createdAt) / 3_600_000) + 6
    );
    return BOTS.reduce((acc, b) => acc + b.ratePerHour * hours, 0n);
  }

  async leaderboard(): Promise<LeaderboardEntry[]> {
    // Bots accrue slowly in real time so the board feels alive.
    const elapsedH = (Date.now() - this.save.createdAt) / 3_600_000 + 6;
    const entries: LeaderboardEntry[] = BOTS.map((b, i) => ({
      name: b.name,
      address: encodeBase58(keccak_256(new TextEncoder().encode(b.name))),
      totalMined:
        (b.ratePerHour * BigInt(Math.floor(elapsedH * 1000))) / 1000n +
        BigInt(i) * 777_000_000n,
      isPlayer: false,
    }));
    entries.push({
      name: "You",
      address: this.address(),
      totalMined: BigInt(this.save.totalMined),
      isPlayer: true,
    });
    return entries.sort((a, b) => (b.totalMined > a.totalMined ? 1 : -1));
  }

  /** Wipe the save and start over (dev helper, exposed in the UI). */
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.save = freshSave();
    this.persist();
  }
}
