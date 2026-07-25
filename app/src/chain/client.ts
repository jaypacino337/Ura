// Real on-chain backend. Instructions are hand-encoded against the Anchor
// program's ABI (discriminator = sha256("global:<name>")[0..8], Borsh args),
// which keeps the bundle free of the full Anchor client.

import { sha256 } from "@noble/hashes/sha2";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { DEVNET_RPC, MINE_COOLDOWN, PROGRAM_ID } from "../game/constants";
import type {
  ConfigState,
  GameBackend,
  LeaderboardEntry,
  MineResult,
  ProofState,
} from "../game/types";
import { shortAddr } from "../lib/format";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const PROOF_ACCOUNT_SIZE = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 4 + 1 + 1;

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toBytes(): Uint8Array; toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
}

function getProvider(): PhantomProvider {
  const provider = (window as any).solana ?? (window as any).phantom?.solana;
  if (!provider) {
    throw new Error(
      "No Solana wallet found. Install Phantom (phantom.app) or switch to Demo mode."
    );
  }
  return provider as PhantomProvider;
}

const disc = (name: string) =>
  sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8);

const u64le = (v: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
};

export class ChainBackend implements GameBackend {
  readonly mode = "devnet" as const;
  private connection: Connection;
  private programId: PublicKey;
  private wallet: PublicKey | null = null;

  constructor(rpc: string = DEVNET_RPC, programId: string = PROGRAM_ID) {
    this.connection = new Connection(rpc, "confirmed");
    this.programId = new PublicKey(programId);
  }

  private pda(seeds: (Uint8Array | Buffer)[]): PublicKey {
    return PublicKey.findProgramAddressSync(
      seeds.map((s) => Buffer.from(s)),
      this.programId
    )[0];
  }

  private get configPda() {
    return this.pda([new TextEncoder().encode("config")]);
  }
  private get mintPda() {
    return this.pda([new TextEncoder().encode("mint")]);
  }
  private get treasuryPda() {
    return this.pda([new TextEncoder().encode("treasury")]);
  }
  private proofPda(authority: PublicKey) {
    return this.pda([new TextEncoder().encode("proof"), authority.toBytes()]);
  }
  private ata(owner: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), this.mintPda.toBytes()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];
  }

  address(): string | null {
    return this.wallet?.toString() ?? null;
  }

  authorityBytes(): Uint8Array | null {
    return this.wallet ? this.wallet.toBytes() : null;
  }

  async connect(): Promise<string> {
    const provider = getProvider();
    const res = await provider.connect();
    this.wallet = new PublicKey(res.publicKey.toString());
    return this.wallet.toString();
  }

  cooldown(): number {
    return MINE_COOLDOWN;
  }

  private async send(ix: TransactionInstruction): Promise<string> {
    if (!this.wallet) throw new Error("Connect a wallet first");
    const provider = getProvider();
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
    tx.add(ix);
    tx.feePayer = this.wallet;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    const { signature } = await provider.signAndSendTransaction(tx);
    await this.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  async getConfig(): Promise<ConfigState> {
    const info = await this.connection.getAccountInfo(this.configPda);
    if (!info) {
      throw new Error(
        "Game not initialized on this cluster yet — deploy the program and run `initialize` (see README)."
      );
    }
    const d = new DataView(info.data.buffer, info.data.byteOffset);
    let o = 8 + 32 + 32; // disc + admin + mint
    const challenge = info.data.slice(o, o + 32);
    o += 32;
    const minDifficulty = d.getUint8(o);
    o += 1;
    const rd = () => {
      const v = d.getBigUint64(o, true);
      o += 8;
      return v;
    };
    const baseReward = rd();
    const maxReward = rd();
    const epochRewards = rd();
    const targetEpochRewards = rd();
    const lastResetAt = Number(d.getBigInt64(o, true));
    o += 8;
    const epochDuration = Number(d.getBigInt64(o, true));
    o += 8;
    return {
      challenge: new Uint8Array(challenge),
      minDifficulty,
      baseReward,
      maxReward,
      epochRewards,
      targetEpochRewards,
      lastResetAt,
      epochDuration,
      totalMiners: rd(),
      totalMines: rd(),
      totalRewards: rd(),
      totalStaked: rd(),
    };
  }

  private decodeProof(data: Uint8Array): ProofState {
    const d = new DataView(data.buffer, data.byteOffset);
    let o = 8;
    const authority = new PublicKey(data.slice(o, o + 32)).toString();
    o += 32;
    const challenge = new Uint8Array(data.slice(o, o + 32));
    o += 32;
    const balance = d.getBigUint64(o, true);
    o += 8;
    const staked = d.getBigUint64(o, true);
    o += 8;
    const lastMineAt = Number(d.getBigInt64(o, true));
    o += 8;
    o += 8; // last_stake_at
    const totalMined = d.getBigUint64(o, true);
    o += 8;
    const totalSolutions = d.getBigUint64(o, true);
    o += 8;
    const streak = d.getUint32(o, true);
    o += 4;
    const bestDifficulty = d.getUint8(o);
    return {
      authority,
      challenge,
      balance,
      staked,
      lastMineAt,
      totalMined,
      totalSolutions,
      streak,
      bestDifficulty,
    };
  }

  async getProof(): Promise<ProofState | null> {
    if (!this.wallet) return null;
    const info = await this.connection.getAccountInfo(
      this.proofPda(this.wallet)
    );
    return info ? this.decodeProof(info.data) : null;
  }

  async register(): Promise<void> {
    if (!this.wallet) throw new Error("Connect a wallet first");
    await this.send(
      new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: this.wallet, isSigner: true, isWritable: true },
          { pubkey: this.configPda, isSigner: false, isWritable: true },
          {
            pubkey: this.proofPda(this.wallet),
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: Buffer.from(disc("register")),
      })
    );
  }

  async submitSolution(nonce: bigint): Promise<MineResult> {
    if (!this.wallet) throw new Error("Connect a wallet first");
    const before = await this.getProof();
    await this.send(
      new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: this.wallet, isSigner: true, isWritable: false },
          { pubkey: this.configPda, isSigner: false, isWritable: true },
          {
            pubkey: this.proofPda(this.wallet),
            isSigner: false,
            isWritable: true,
          },
        ],
        data: Buffer.concat([Buffer.from(disc("mine")), u64le(nonce)]),
      })
    );
    const after = await this.getProof();
    return {
      reward:
        after && before ? after.totalMined - before.totalMined : 0n,
      difficulty: after?.bestDifficulty ?? 0,
      streak: after?.streak ?? 0,
    };
  }

  async claim(amount: bigint): Promise<void> {
    if (!this.wallet) throw new Error("Connect a wallet first");
    await this.send(
      new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: this.wallet, isSigner: true, isWritable: true },
          { pubkey: this.configPda, isSigner: false, isWritable: false },
          {
            pubkey: this.proofPda(this.wallet),
            isSigner: false,
            isWritable: true,
          },
          { pubkey: this.mintPda, isSigner: false, isWritable: true },
          { pubkey: this.ata(this.wallet), isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: Buffer.concat([Buffer.from(disc("claim")), u64le(amount)]),
      })
    );
  }

  private stakeIx(name: "stake" | "unstake", amount: bigint) {
    const userAta = this.ata(this.wallet!);
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.wallet!, isSigner: true, isWritable: false },
        { pubkey: this.configPda, isSigner: false, isWritable: true },
        {
          pubkey: this.proofPda(this.wallet!),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: this.mintPda, isSigner: false, isWritable: false },
        { pubkey: userAta, isSigner: false, isWritable: true },
        { pubkey: this.treasuryPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from(disc(name)), u64le(amount)]),
    });
  }

  async stake(amount: bigint): Promise<void> {
    if (!this.wallet) throw new Error("Connect a wallet first");
    await this.send(this.stakeIx("stake", amount));
  }

  async unstake(amount: bigint): Promise<void> {
    if (!this.wallet) throw new Error("Connect a wallet first");
    await this.send(this.stakeIx("unstake", amount));
  }

  async walletBalance(): Promise<bigint> {
    if (!this.wallet) return 0n;
    try {
      const res = await this.connection.getTokenAccountBalance(
        this.ata(this.wallet)
      );
      return BigInt(res.value.amount);
    } catch {
      return 0n; // ATA doesn't exist yet
    }
  }

  async leaderboard(): Promise<LeaderboardEntry[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [{ dataSize: PROOF_ACCOUNT_SIZE }],
    });
    const me = this.wallet?.toString();
    return accounts
      .map(({ account }) => this.decodeProof(account.data))
      .sort((a, b) => (b.totalMined > a.totalMined ? 1 : -1))
      .slice(0, 20)
      .map((p) => ({
        name: p.authority === me ? "You" : shortAddr(p.authority),
        address: p.authority,
        totalMined: p.totalMined,
        isPlayer: p.authority === me,
      }));
  }
}
