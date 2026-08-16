import { useState } from "react";
import { fmtMcap } from "../engine/market";
import { store } from "../engine/useWorld";
import type { Caller, RankedCall, Token } from "../engine/types";
import { fmtSol, fmtX, gradeColor, timeAgo } from "../lib/ui";

export function CallCard({
  ranked,
  token,
  caller,
  rank,
  onOpenToken,
}: {
  ranked: RankedCall;
  token: Token | undefined;
  caller: Caller | undefined;
  rank: number;
  onOpenToken: (tokenId: string) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const call = ranked.call;
  const x = token ? token.mcap / call.entryMcap : 1;
  const green = x >= 1;
  const v = call.verdict;

  return (
    <article
      className={`call ${call.outcome !== "open" ? `call-${call.outcome}` : ""}`}
    >
      <div className="call-rank mono">{rank}</div>
      <div className="call-body">
        <header className="call-head">
          <span
            className="avatar"
            style={{ background: `hsl(${caller?.avatarHue ?? 0} 70% 45%)` }}
          />
          <span className={`handle ${caller?.isUser ? "handle-you" : ""}`}>
            @{caller?.handle ?? "?"}
          </span>
          <span className="muted mono small">{timeAgo(call.createdAt)}</span>
          <span className="muted small">·</span>
          <button
            className="tokenlink mono"
            onClick={() => onOpenToken(call.tokenId)}
          >
            {token?.emoji} ${token?.ticker ?? "???"}
          </button>
          <span className="spacer" />
          <span
            className="verdict-chip mono"
            style={{ borderColor: gradeColor(v.grade), color: gradeColor(v.grade) }}
            title={v.factors
              .map((f) => `${f.label}: ${f.value}/100 (w=${f.weight})`)
              .join("\n")}
          >
            AI {v.score}
            <b className="verdict-grade">{v.grade}</b>
          </span>
        </header>

        <p className="thesis">{call.thesis}</p>
        <p className="verdict-note small">▸ {v.note}</p>

        <div className="call-stats mono small">
          <span>
            in {fmtMcap(call.entryMcap)} → now{" "}
            {token ? fmtMcap(token.mcap) : "—"}
          </span>
          <span className={green ? "up" : "down"}>
            {green ? "▲" : "▼"} {fmtX(x)}
          </span>
          {call.peakX > 1.02 && (
            <span className="muted">peak {fmtX(call.peakX)}</span>
          )}
          {call.accruedSol > 0 && (
            <span className="sol">+{fmtSol(call.accruedSol)}</span>
          )}
          {call.outcome !== "open" && (
            <span className={call.outcome === "won" ? "up" : "down"}>
              {call.outcome.toUpperCase()}
            </span>
          )}
        </div>

        <footer className="call-actions mono small">
          <button onClick={() => store.react(call.id, "agree")}>
            ▲ {call.agrees}
          </button>
          <button onClick={() => store.react(call.id, "echo")}>
            ⇄ {call.echoes}
          </button>
          <button onClick={() => store.react(call.id, "fade")}>
            fade {call.fades}
          </button>
          <span className="muted">{call.impressions} views</span>
          <span className="spacer" />
          <button onClick={() => setShowWhy(!showWhy)} className="muted">
            why this rank?
          </button>
        </footer>

        {showWhy && (
          <div className="why mono small">
            <div className="why-title">
              rank score {ranked.rankScore.toFixed(2)} — open ranker, no black box
            </div>
            {ranked.breakdown.map((b) => (
              <div key={b.label} className="why-row">
                <span>{b.label}</span>
                <span>{b.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
