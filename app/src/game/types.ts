export interface ConfigState {
  challenge: Uint8Array;
  minDifficulty: number;
  baseReward: bigint;
  maxReward: bigint;
  epochRewards: bigint;
  targetEpochRewards: bigint;
  lastResetAt: number;
  epochDuration: number;
  totalMiners: bigint;
  totalMines: bigint;
  totalRewards: bigint;
  totalStaked: bigint;
}

export interface ProofState {
  authority: string;
  challenge: Uint8Array;
  balance: bigint;
  staked: bigint;
  lastMineAt: number;
  totalMined: bigint;
  totalSolutions: bigint;
  streak: number;
  bestDifficulty: number;
}

export interface LeaderboardEntry {
  name: string;
  address: string;
  totalMined: bigint;
  isPlayer: boolean;
}

export interface MineResult {
  reward: bigint;
  difficulty: number;
  streak: number;
}

/** Common surface for the demo simulation and the real on-chain client. */
export interface GameBackend {
  readonly mode: "demo" | "devnet";
  /** Wallet address (demo: generated, chain: connected wallet). */
  address(): string | null;
  /** Raw 32-byte pubkey used inside the mining hash. */
  authorityBytes(): Uint8Array | null;
  connect(): Promise<string>;
  getConfig(): Promise<ConfigState>;
  getProof(): Promise<ProofState | null>;
  register(): Promise<void>;
  /** Rewards cooldown timestamp used by the round loop. */
  cooldown(): number;
  submitSolution(nonce: bigint): Promise<MineResult>;
  claim(amount: bigint): Promise<void>;
  stake(amount: bigint): Promise<void>;
  unstake(amount: bigint): Promise<void>;
  /** Claimed wallet balance of URA (base units). */
  walletBalance(): Promise<bigint>;
  leaderboard(): Promise<LeaderboardEntry[]>;
}
