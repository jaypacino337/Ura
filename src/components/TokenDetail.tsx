import { fmtMcap } from "../engine/market";
import { TokenChart } from "./TokenChart";
import type { Call, Caller, Token } from "../engine/types";
import { fmtX, timeAgo } from "../lib/ui";

export function TokenDetail({
  token,
  calls,
  callers,
  onClose,
  onCall,
}: {
  token: Token;
  calls: Call[];
  callers: Map<string, Caller>;
  onClose: () => void;
  onCall: () => void;
}) {
  const tokenCalls = calls
    .filter((c) => c.tokenId === token.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const drawdown = 1 - token.mcap / token.athMcap;
  return (
    <section className="panel token-detail">
      <header className="detail-head">
        <span className="token-emoji big">{token.emoji}</span>
        <div>
          <div className="mono detail-ticker">
            ${token.ticker}
            {token.regime === "rugged" && <span className="down"> · RUGGED</span>}
          </div>
          <div className="muted small">{token.name}</div>
        </div>
        <span className="spacer" />
        <button className="btn-mint mono small" onClick={onCall}>
          call it →
        </button>
        <button className="btn-ghost mono small" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="detail-stats mono small">
        <span>
          mcap <b>{fmtMcap(token.mcap)}</b>
        </span>
        <span>
          ath <b>{fmtMcap(token.athMcap)}</b>
          {drawdown > 0.02 && (
            <span className="down"> (−{Math.round(drawdown * 100)}%)</span>
          )}
        </span>
        <span>
          holders <b>{token.holders}</b>
        </span>
        <span>
          age <b>{timeAgo(token.launchedAt)}</b>
        </span>
        <span>
          regime <b>{token.regime}</b>
        </span>
      </div>

      <TokenChart token={token} calls={calls} callers={callers} />

      <div className="detail-callers">
        <div className="mono small muted" style={{ marginBottom: 6 }}>
          callers on this chart — plotted at their entries
        </div>
        {tokenCalls.length === 0 && (
          <div className="muted small">
            no calls yet. be first — early calls get the explore boost.
          </div>
        )}
        <ul className="entry-list">
          {tokenCalls.slice(0, 8).map((c) => {
            const caller = callers.get(c.callerId);
            const x = token.mcap / c.entryMcap;
            return (
              <li key={c.id} className="mono small">
                <span
                  className="avatar"
                  style={{
                    background: `hsl(${caller?.avatarHue ?? 0} 70% 45%)`,
                  }}
                />
                <span className={caller?.isUser ? "handle-you" : ""}>
                  @{caller?.handle}
                </span>
                <span className="muted">in {fmtMcap(c.entryMcap)}</span>
                <span className={x >= 1 ? "up" : "down"}>{fmtX(x)}</span>
                <span className="muted">AI {c.verdict.score}</span>
                <span className="muted">{timeAgo(c.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
