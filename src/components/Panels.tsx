import type { World } from "../engine/store";
import { EQUIPMENT, FEE_SPLIT, rankOf, type LedgerTx } from "../engine/types";
import { store } from "../engine/useWorld";
import { fmtAmt, fmtUsd, shortHash, timeAgo } from "../lib/fmt";

export function reserveValueUsd(world: World): number {
  const r = world.reserve;
  return r.usdg + r.eth * world.ethPrice + r.nne * world.nnePrice;
}

export function ReservePanel({ world }: { world: World }) {
  const r = world.reserve;
  const total = reserveValueUsd(world);
  const rows: {
    label: string;
    amount: string;
    usd: number;
    status: "LIVE" | "PLANNED";
  }[] = [
    { label: "USDG", amount: fmtUsd(r.usdg), usd: r.usdg, status: "LIVE" },
    { label: "ETH", amount: fmtAmt(r.eth, 4), usd: r.eth * world.ethPrice, status: "LIVE" },
    { label: "NNE", amount: fmtAmt(r.nne, 3), usd: r.nne * world.nnePrice, status: "LIVE" },
    { label: "xU3O8", amount: "0", usd: 0, status: "PLANNED" },
  ];
  return (
    <section className="panel vault">
      <h3 className="panel-title mono">▚ RESERVE VAULT</h3>
      <div className="vault-total mono">
        <span className="dim small">TOTAL RESERVE</span>
        <span className="vault-usd">${fmtUsd(total)}</span>
      </div>
      <table className="vault-table mono small">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.status === "PLANNED" ? "dim" : ""}>
              <td>{row.label}</td>
              <td className="num">{row.amount}</td>
              <td className="num">${fmtUsd(row.usd)}</td>
              <td>
                <span className={`badge badge-${row.status.toLowerCase()}`}>
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small vault-note">
        xU3O8 (tokenized U₃O₈) requires whitelist approval — tracked as a
        roadmap milestone, never simulated as held. No physical backing is
        claimed in this build.
      </p>
      <div className="ledger">
        <div className="dim small mono">RESERVE TRANSACTIONS</div>
        {r.ledger.slice(0, 6).map((tx, i) => (
          <LedgerRow key={i} tx={tx} />
        ))}
      </div>
    </section>
  );
}

function LedgerRow({ tx }: { tx: LedgerTx }) {
  const sign = tx.kind === "ops" ? "−" : "+";
  return (
    <div className="ledger-row mono small">
      <span className="dim">{timeAgo(tx.t)}</span>
      <span>{tx.note}</span>
      <span className="num">
        {sign}
        {fmtAmt(tx.amount, tx.asset === "USDG" ? 0 : 4)} {tx.asset}
      </span>
      <span className="hash dim" title={tx.hash}>
        {shortHash(tx.hash, 8)}
      </span>
    </div>
  );
}

export function OperationPanel({
  world,
  onError,
}: {
  world: World;
  onError: (m: string) => void;
}) {
  const u = world.user;
  const rank = rankOf(u.lifetimeOre);
  const tier = EQUIPMENT[u.equipmentTier];
  const next = EQUIPMENT[u.equipmentTier + 1];
  const act = (fn: () => string | null) => {
    const err = fn();
    if (err) onError(err);
  };
  return (
    <section className="panel">
      <h3 className="panel-title mono">▚ YOUR OPERATION</h3>
      <div className="op-rank mono">
        <span className="rank-name">{rank.name}</span>
        {rank.next && (
          <span className="dim small">
            {" "}
            → {rank.next.name} at {fmtUsd(rank.next.ore)} ore
          </span>
        )}
      </div>
      <div className="op-grid mono small">
        <span>
          PERMITS <b>{u.permits}</b>/{tier.permitCap}
        </span>
        <span>
          ORE UNITS <b>{fmtUsd(u.oreUnits)}</b>
        </span>
        <span>
          $USR <b>{fmtUsd(u.usr)}</b>
        </span>
        <span>
          REWARDS <b>{fmtUsd(u.rewardsUsdg)} USDG</b>
        </span>
        <span>
          STRIKES <b>{u.strikes}</b>
        </span>
        <span>
          LIFETIME ORE <b>{fmtUsd(u.lifetimeOre)}</b>
        </span>
      </div>
      <div className="op-equipment mono small">
        <span className="dim">EQUIPMENT</span> {tier.icon} {tier.name}
        {tier.surveyReveals > 0 && (
          <span className="dim">
          {" "}· surveys {tier.surveyReveals} barren plots/round
          </span>
        )}
      </div>
      <div className="op-actions">
        <button className="btn mono" onClick={() => act(() => store.refine())}>
          REFINE 10 ORE → 24 USR
        </button>
        {next && (
          <button className="btn mono" onClick={() => act(() => store.upgrade())}>
            UPGRADE: {next.icon} {next.name} ({fmtUsd(next.costUsr)} USR +{" "}
            {fmtUsd(next.costOre)} ore)
          </button>
        )}
      </div>
      <p className="dim small">
        Permits are free and regenerate every round ({tier.permitsPerRound}
        /round at this tier). No deposits buy entries in this build.
      </p>
    </section>
  );
}

export function LeaderboardPanel({ world }: { world: World }) {
  const rows = [...world.prospectors.values()]
    .filter((p) => p.claimsMade > 0 || p.isUser)
    .sort((a, b) => b.lifetimeOre - a.lifetimeOre)
    .slice(0, 10);
  return (
    <section className="panel">
      <h3 className="panel-title mono">▚ PROSPECTOR LEADERBOARD</h3>
      <ol className="lb mono small">
        {rows.map((p, i) => (
          <li key={p.id} className={p.isUser ? "lb-you" : ""}>
            <span className="dim lb-rank">{i + 1}</span>
            <span className="lb-handle">@{p.handle}</span>
            <span className="dim">{rankOf(p.lifetimeOre).name}</span>
            <span className="num">{fmtUsd(p.lifetimeOre)} ore</span>
            <span className="num gold">{fmtUsd(p.rewardsUsdg)} USDG</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function StrategyPanel({ world }: { world: World }) {
  const splits = [
    { label: "RESERVE ACQUISITION", pct: FEE_SPLIT.reserve, cls: "bar-reserve" },
    { label: "MINING REWARD POOL", pct: FEE_SPLIT.rewards, cls: "bar-rewards" },
    { label: "DEVELOPMENT / OPS", pct: FEE_SPLIT.ops, cls: "bar-ops" },
  ];
  return (
    <section className="panel">
      <h3 className="panel-title mono">▚ STRATEGY — WHERE CREATOR REVENUE GOES</h3>
      <div className="splits">
        {splits.map((s) => (
          <div key={s.label} className="split mono small">
            <span className="split-label">{s.label}</span>
            <span className="split-bar">
              <span className={`split-fill ${s.cls}`} style={{ width: `${s.pct * 100}%` }} />
            </span>
            <span className="num">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
      <p className="dim small">
        Published before launch; every inflow appears in the reserve ledger.
        Ops accrued: {fmtUsd(world.feesToOps)} USDG (sim).
      </p>
    </section>
  );
}

export function DocsPanel() {
  const items: { name: string; status: "LIVE" | "BETA" | "PLANNED" }[] = [
    { name: "5×5 prospecting rounds · commit-reveal randomness", status: "LIVE" },
    { name: "Free prospecting permits (no paid entry)", status: "LIVE" },
    { name: "Reserve dashboard: USDG · ETH ledger", status: "LIVE" },
    { name: "Nuclear-sector exposure (NNE) in reserve", status: "BETA" },
    { name: "Equipment upgrades · refining · ranks", status: "BETA" },
    { name: "Pons launch: $USR / ETH pair + live creator-fee feed", status: "PLANNED" },
    { name: "Onchain VRF settlement + public settlement txs", status: "PLANNED" },
    { name: "xU3O8 tokenized-uranium reserve (whitelist approval)", status: "PLANNED" },
    { name: "USR / NNE pairing (liquidity permitting)", status: "PLANNED" },
  ];
  return (
    <section className="panel">
      <h3 className="panel-title mono">▚ DOCS — LIVE vs BETA vs PLANNED</h3>
      <ul className="docs mono small">
        {items.map((i) => (
          <li key={i.name}>
            <span className={`badge badge-${i.status.toLowerCase()}`}>{i.status}</span>
            <span>{i.name}</span>
          </li>
        ))}
      </ul>
      <p className="dim small">
        Paid-entry prospecting is intentionally out of scope: real-money
        randomized entries require jurisdiction-specific gaming compliance.
        Permits stay free until that work is done.
      </p>
    </section>
  );
}
