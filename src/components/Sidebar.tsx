import { fmtMcap } from "../engine/market";
import type { Call, Caller, Token } from "../engine/types";
import { fmtSol, fmtX, timeAgo } from "../lib/ui";

export function TokenBoard({
  tokens,
  calls,
  selected,
  onSelect,
}: {
  tokens: Token[];
  calls: Call[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const sorted = [...tokens].sort((a, b) => b.mcap - a.mcap);
  const callCount = (id: string) =>
    calls.filter((c) => c.tokenId === id && c.outcome === "open").length;
  return (
    <section className="panel">
      <h3 className="panel-title">
        <span className="hl">the board</span>
      </h3>
      <ul className="tokens">
        {sorted.map((t) => {
          const h = t.history;
          const m5 =
            h.length > 60 ? t.mcap / h[Math.max(0, h.length - 60)].mcap - 1 : 0;
          return (
            <li key={t.id}>
              <button
                className={`token-row ${selected === t.id ? "active" : ""} ${
                  t.regime === "rugged" ? "rugged" : ""
                }`}
                onClick={() => onSelect(t.id)}
              >
                <span className="token-emoji">{t.emoji}</span>
                <span className="token-name">
                  <b className="mono">${t.ticker}</b>
                  <span className="muted small"> {t.name}</span>
                </span>
                <Sparkline token={t} />
                <span className="token-mcap mono small">
                  {fmtMcap(t.mcap)}
                  <span className={m5 >= 0 ? "up" : "down"}>
                    {" "}
                    {m5 >= 0 ? "+" : ""}
                    {(m5 * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="token-calls mono small">
                  {callCount(t.id)} calls
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Sparkline({ token }: { token: Token }) {
  const h = token.history;
  const pts = h.slice(-40);
  if (pts.length < 2) return <span className="spark" />;
  const lo = Math.min(...pts.map((p) => p.mcap));
  const hi = Math.max(...pts.map((p) => p.mcap));
  const up = pts[pts.length - 1].mcap >= pts[0].mcap;
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * 56;
      const y = 16 - ((p.mcap - lo) / Math.max(hi - lo, 1)) * 14;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
  return (
    <svg className="spark" viewBox="0 0 56 18">
      <path d={d} fill="none" stroke={up ? "#58f5b0" : "#f55a6a"} strokeWidth="1.5" />
    </svg>
  );
}

export function Leaderboard({ callers }: { callers: Caller[] }) {
  const board = [...callers]
    .filter((c) => c.calls > 0 || c.isUser)
    .sort((a, b) => b.earnedSol - a.earnedSol)
    .slice(0, 10);
  return (
    <section className="panel">
      <h3 className="panel-title">
        <span className="hl">leaderboard</span>
        <span className="muted small"> earned, not bought</span>
      </h3>
      <ol className="lb">
        {board.map((c, i) => {
          const resolved = c.wins + c.losses;
          const wr = resolved > 0 ? Math.round((c.wins / resolved) * 100) : null;
          return (
            <li key={c.id} className={c.isUser ? "lb-you" : ""}>
              <span className="mono lb-rank">{i + 1}</span>
              <span
                className="avatar"
                style={{ background: `hsl(${c.avatarHue} 70% 45%)` }}
              />
              <span className="lb-handle">@{c.handle}</span>
              <span className="muted small mono">
                {wr === null ? "—" : `${wr}% wr`}
              </span>
              <span className="sol mono small">{fmtSol(c.earnedSol)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function YourCalls({
  calls,
  tokens,
  onOpenToken,
}: {
  calls: Call[];
  tokens: Map<string, Token>;
  onOpenToken: (id: string) => void;
}) {
  const mine = calls.filter((c) => c.callerId === "you").slice(0, 8);
  if (mine.length === 0) return null;
  return (
    <section className="panel">
      <h3 className="panel-title">
        <span className="hl">your calls</span>
      </h3>
      <ul className="mycalls">
        {mine.map((c) => {
          const t = tokens.get(c.tokenId);
          const x = t ? t.mcap / c.entryMcap : 1;
          return (
            <li key={c.id}>
              <button className="mycall mono small" onClick={() => onOpenToken(c.tokenId)}>
                <span>
                  {t?.emoji} ${t?.ticker}
                </span>
                <span className={x >= 1 ? "up" : "down"}>{fmtX(x)}</span>
                <span className="muted">{timeAgo(c.createdAt)}</span>
                <span className="sol">+{fmtSol(c.accruedSol)}</span>
                <span
                  className={
                    c.outcome === "open"
                      ? "muted"
                      : c.outcome === "won"
                        ? "up"
                        : "down"
                  }
                >
                  {c.outcome}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
