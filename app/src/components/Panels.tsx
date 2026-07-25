import { useEffect, useState } from "react";
import { pickaxeFor, MAX_SUPPLY } from "../game/constants";
import { multiplierBps } from "../game/rewards";
import type { ConfigState, LeaderboardEntry, ProofState } from "../game/types";
import type { Find } from "../game/useGame";
import { fmtDuration, fmtUra, shortAddr } from "../lib/format";
import type { MinerStatus } from "../miner/useMiner";

export function StatsPanel({
  proof,
  walletUra,
}: {
  proof: ProofState;
  walletUra: bigint;
}) {
  const pick = pickaxeFor(proof.totalMined);
  const mult = multiplierBps(proof.staked, proof.streak);
  const progressToNext = pick.next
    ? Number((proof.totalMined * 100n) / pick.next.threshold)
    : 100;
  return (
    <section className="card">
      <h3>Miner</h3>
      <div className="pickaxe-row">
        <span className="pickaxe-icon">{pick.icon}</span>
        <div>
          <div className="pickaxe-name">{pick.name}</div>
          <div className="muted small">Level {pick.level + 1} rig</div>
        </div>
      </div>
      {pick.next && (
        <div className="progress">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(progressToNext, 100)}%` }}
          />
          <span className="progress-label small">
            {fmtUra(proof.totalMined, 2)} / {fmtUra(pick.next.threshold, 0)} URA
            → {pick.next.name}
          </span>
        </div>
      )}
      <dl className="stat-grid">
        <div>
          <dt>Unclaimed</dt>
          <dd className="mono glow-gold">{fmtUra(proof.balance)} URA</dd>
        </div>
        <div>
          <dt>In wallet</dt>
          <dd className="mono">{fmtUra(walletUra)} URA</dd>
        </div>
        <div>
          <dt>Staked</dt>
          <dd className="mono">{fmtUra(proof.staked)} URA</dd>
        </div>
        <div>
          <dt>Multiplier</dt>
          <dd className="mono glow-green">
            {(Number(mult) / 10000).toFixed(2)}×
          </dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd className="mono">{proof.streak} 🔥</dd>
        </div>
        <div>
          <dt>Best difficulty</dt>
          <dd className="mono">{proof.bestDifficulty} bits</dd>
        </div>
        <div>
          <dt>Solutions</dt>
          <dd className="mono">{proof.totalSolutions.toString()}</dd>
        </div>
        <div>
          <dt>Lifetime mined</dt>
          <dd className="mono">{fmtUra(proof.totalMined)} URA</dd>
        </div>
      </dl>
    </section>
  );
}

export function ActionsPanel({
  proof,
  walletUra,
  busy,
  onClaim,
  onStake,
  onUnstake,
}: {
  proof: ProofState;
  walletUra: bigint;
  busy: boolean;
  onClaim: () => void;
  onStake: (amount: bigint) => void;
  onUnstake: (amount: bigint) => void;
}) {
  const [stakeAmt, setStakeAmt] = useState("1");
  const parse = (s: string): bigint | null => {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return BigInt(Math.round(n * 1e9));
  };
  const amt = parse(stakeAmt);
  return (
    <section className="card">
      <h3>Vault</h3>
      <button
        className="btn btn-gold wide"
        disabled={busy || proof.balance === 0n}
        onClick={onClaim}
      >
        Claim {fmtUra(proof.balance)} URA
      </button>
      <div className="stake-row">
        <input
          className="input mono"
          value={stakeAmt}
          onChange={(e) => setStakeAmt(e.target.value)}
          placeholder="URA"
          inputMode="decimal"
        />
        <button
          className="btn"
          disabled={busy || !amt || amt > walletUra}
          onClick={() => amt && onStake(amt)}
        >
          Stake
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy || !amt || amt > proof.staked}
          onClick={() => amt && onUnstake(amt)}
        >
          Unstake
        </button>
      </div>
      <p className="muted small">
        Staking boosts every future find: +1% per whole URA staked, up to
        +100%. Streaks add up to +25% more.
      </p>
    </section>
  );
}

export function EpochPanel({ config }: { config: ConfigState }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(config.lastResetAt + config.epochDuration - now, 0);
  const pct = Number(
    (config.epochRewards * 100n) /
      (config.targetEpochRewards === 0n ? 1n : config.targetEpochRewards)
  );
  const supplyPct =
    Number((config.totalRewards * 10_000n) / MAX_SUPPLY) / 100;
  return (
    <section className="card">
      <h3>Network</h3>
      <dl className="stat-grid">
        <div>
          <dt>Difficulty</dt>
          <dd className="mono">{config.minDifficulty} bits</dd>
        </div>
        <div>
          <dt>Epoch resets in</dt>
          <dd className="mono">{fmtDuration(remaining)}</dd>
        </div>
        <div>
          <dt>Base reward</dt>
          <dd className="mono">{fmtUra(config.baseReward)} URA</dd>
        </div>
        <div>
          <dt>Miners</dt>
          <dd className="mono">{config.totalMiners.toString()}</dd>
        </div>
      </dl>
      <div className="progress">
        <div
          className="progress-fill progress-amber"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        <span className="progress-label small">
          epoch emissions {fmtUra(config.epochRewards, 1)} /{" "}
          {fmtUra(config.targetEpochRewards, 0)} URA
        </span>
      </div>
      <div className="progress">
        <div
          className="progress-fill progress-blue"
          style={{ width: `${Math.min(supplyPct, 100)}%` }}
        />
        <span className="progress-label small">
          {fmtUra(config.totalRewards, 0)} / {fmtUra(MAX_SUPPLY, 0)} URA mined
          ({supplyPct.toFixed(2)}%)
        </span>
      </div>
    </section>
  );
}

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <section className="card">
      <h3>Leaderboard</h3>
      <ol className="board">
        {entries.slice(0, 10).map((e, i) => (
          <li key={e.address} className={e.isPlayer ? "board-you" : ""}>
            <span className="board-rank">{medals[i] ?? `#${i + 1}`}</span>
            <span className="board-name">
              {e.name}
              <span className="muted small"> {shortAddr(e.address)}</span>
            </span>
            <span className="mono board-amt">{fmtUra(e.totalMined, 1)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FindsFeed({ finds }: { finds: Find[] }) {
  if (finds.length === 0) return null;
  return (
    <section className="card">
      <h3>Recent finds</h3>
      <ul className="feed">
        {finds.map((f) => (
          <li key={f.id}>
            <span className="mono glow-green">+{fmtUra(f.reward)} URA</span>
            <span className="muted small">
              {f.difficulty} bits · streak {f.streak} ·{" "}
              {new Date(f.time).toLocaleTimeString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoundStatus({ status }: { status: MinerStatus }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);
  if (status.phase === "idle") return null;
  const waitMs = status.submitAt ? status.submitAt - Date.now() : 0;
  const met = (status.best?.difficulty ?? -1) >= status.minDifficulty;
  return (
    <div className="round-status">
      <div className="round-item">
        <span className="muted small">best this round</span>
        <span className={`mono ${met ? "glow-green" : ""}`}>
          {status.best ? `${status.best.difficulty} bits` : "—"}{" "}
          <span className="muted small">/ {status.minDifficulty} needed</span>
        </span>
      </div>
      <div className="round-item">
        <span className="muted small">hashes</span>
        <span className="mono">{status.totalHashes.toLocaleString()}</span>
      </div>
      <div className="round-item">
        <span className="muted small">
          {waitMs > 0 ? "submit window opens" : "status"}
        </span>
        <span className="mono">
          {status.phase === "submitting"
            ? "submitting…"
            : waitMs > 0
              ? fmtDuration(Math.ceil(waitMs / 1000))
              : met
                ? "submitting best hash…"
                : "digging deeper…"}
        </span>
      </div>
      {status.best && (
        <div className="round-hash mono small" title={status.best.hashHex}>
          {status.best.hashHex.slice(0, 24)}…
        </div>
      )}
    </div>
  );
}
