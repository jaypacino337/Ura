import { useState } from "react";
import { commitmentFor, deriveGrades, receiptHash } from "../engine/det";
import type { World } from "../engine/store";
import { plotCode, type Round } from "../engine/types";
import {
  fmtCountdown,
  fmtUsd,
  GRADE_COLOR,
  GRADE_LABEL,
  shortHash,
  timeAgo,
} from "../lib/fmt";

export function RoundPanel({ world }: { world: World }) {
  const r = world.round;
  const now = Date.now();
  const phase =
    r.status === "open"
      ? { label: "CLAIMS OPEN", cls: "ok", until: r.locksAt }
      : r.status === "locked"
        ? { label: "LOCKED — SETTLING", cls: "warn", until: r.settlesAt }
        : { label: "SETTLED", cls: "hot", until: 0 };

  const myClaims = r.claims.filter((c) => c.includes("you")).length;
  const totalClaims = r.claims.reduce((a, c) => a + c.length, 0);

  return (
    <section className="panel round-panel">
      <header className="round-head mono">
        <span className="round-id">MINING ROUND #{r.id}</span>
        <span className={`phase phase-${phase.cls}`}>{phase.label}</span>
        {phase.until > 0 && (
          <span className="countdown">{fmtCountdown(phase.until - now)}</span>
        )}
      </header>
      <div className="round-stats mono small">
        <span>
          REWARD POOL <b>{fmtUsd(r.poolUsdg)} USDG</b>
        </span>
        <span>
          CLAIMS FILED <b>{totalClaims}</b>
        </span>
        <span>
          YOUR CLAIMS <b>{myClaims}</b>
        </span>
        <span>
          PERMITS LEFT <b>{world.user.permits}</b>
        </span>
      </div>
      <div className="commit mono small">
        <span className="dim">RANDOMNESS COMMITMENT (sha-256)</span>
        <span className="hash" title={r.commitment}>
          {shortHash(r.commitment, 18)}
        </span>
        <span className="dim">
          seed sealed at round open · revealed at settlement · every outcome
          derives from the seed
        </span>
      </div>
      {r.status === "settled" && r.result && (
        <div className="strike-banner mono">
          ☢ STRIKE AT <b>{plotCode(r.result.strike)}</b> · seed{" "}
          <span className="hash">{shortHash(r.result.seed, 12)}</span> ·{" "}
          {r.result.payouts.length} payouts ·{" "}
          {r.result.rolledToReserve > 0.01 &&
            `${fmtUsd(r.result.rolledToReserve)} USDG unclaimed → reserve`}
        </div>
      )}
    </section>
  );
}

export function HistoryPanel({ world }: { world: World }) {
  return (
    <section className="panel">
      <h3 className="panel-title mono">▚ ROUND HISTORY</h3>
      <ul className="hist">
        {world.history.slice(0, 8).map((r) => (
          <HistRow key={r.id} r={r} world={world} />
        ))}
      </ul>
    </section>
  );
}

function HistRow({ r, world }: { r: Round; world: World }) {
  const [verify, setVerify] = useState<null | boolean>(null);
  const [open, setOpen] = useState(false);
  if (!r.result) return null;
  const res = r.result;
  const strikeWinners = res.payouts.filter((p) => p.plot === res.strike);

  const runVerify = () => {
    // Recompute everything from the revealed seed, in this browser.
    const ok =
      commitmentFor(r.id, res.seed) === r.commitment &&
      deriveGrades(res.seed).strike === res.strike &&
      receiptHash(res.seed) === res.txHash;
    setVerify(ok);
  };

  return (
    <li className="hist-row mono small">
      <div className="hist-line">
        <span className="dim">#{r.id}</span>
        <span style={{ color: GRADE_COLOR.MOTHERLODE }}>
          ☢ {plotCode(res.strike)}
        </span>
        <span>
          {strikeWinners.length > 0
            ? `${strikeWinners.length} striker${strikeWinners.length > 1 ? "s" : ""} · ${fmtUsd(
                strikeWinners.reduce((a, p) => a + p.amountUsdg, 0)
              )} USDG`
            : "no claim on strike → reserve"}
        </span>
        <span className="dim">{timeAgo(r.settlesAt)}</span>
        <span className="spacer" />
        <button className="linkish" onClick={() => setOpen(!open)}>
          {open ? "close" : "receipt"}
        </button>
        <button className="linkish" onClick={runVerify}>
          {verify === null ? "verify" : verify ? "VERIFIED ✓" : "MISMATCH ✗"}
        </button>
      </div>
      {open && (
        <div className="hist-detail">
          <div>
            seed <span className="hash">{res.seed}</span>
          </div>
          <div>
            commitment <span className="hash">{shortHash(r.commitment, 22)}</span>
          </div>
          <div>
            settlement <span className="hash">{shortHash(res.txHash, 22)}</span>
          </div>
          <div className="hist-winners">
            {res.payouts.slice(0, 6).map((p, i) => {
              const who = world.prospectors.get(p.prospectorId);
              return (
                <span key={i}>
                  @{who?.handle} {plotCode(p.plot)} +{fmtUsd(p.amountUsdg)} USDG
                </span>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

export function GradeLegend() {
  return (
    <div className="legend mono small">
      {(["BARREN", "TRACE", "ORE", "HIGH_GRADE", "MOTHERLODE"] as const).map(
        (g) => (
          <span key={g} style={{ color: GRADE_COLOR[g] }}>
            ▪ {GRADE_LABEL[g]}
          </span>
        )
      )}
      <span className="dim">
        payout split 70 / 15 / 10 / 5 — unclaimed tranches roll to the reserve
      </span>
    </div>
  );
}
