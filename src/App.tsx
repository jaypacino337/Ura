import { useMemo, useState } from "react";
import { CallCard } from "./components/CallCard";
import { MakeCall } from "./components/MakeCall";
import { Leaderboard, TokenBoard, YourCalls } from "./components/Sidebar";
import { TokenDetail } from "./components/TokenDetail";
import { useWorld } from "./engine/useWorld";
import { fmtSol } from "./lib/ui";

type Tab = "ranked" | "new" | "top";

export default function App() {
  const { world } = useWorld();
  const [tab, setTab] = useState<Tab>("ranked");
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const feed = useMemo(() => {
    if (tab === "ranked") return world.feed;
    if (tab === "new")
      return [...world.feed].sort(
        (a, b) => b.call.createdAt - a.call.createdAt
      );
    return [...world.feed].sort(
      (a, b) => b.call.accruedSol - a.call.accruedSol
    );
  }, [world.feed, tab]);

  const token = selectedToken ? world.tokens.get(selectedToken) : undefined;
  const openCalls = world.calls.filter((c) => c.outcome === "open").length;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="hl brand-mark">SIGNAL</span>
          <span className="muted small tagline">
            the tape, ranked · live callouts · AI verdicts on every call
          </span>
        </div>
        <div className="top-right mono small">
          <span className="live-dot" /> LIVE · {openCalls} open calls ·{" "}
          {world.tokens.size} coins
          <span className="sol earned">
            @you · {fmtSol(world.user.earnedSol)}
          </span>
          <button className="btn-mint mono" onClick={() => setComposing(true)}>
            + make a call
          </button>
        </div>
      </header>

      <div className="ticker mono small">
        <div className="ticker-inner">
          {[...world.tokens.values()]
            .sort((a, b) => b.mcap - a.mcap)
            .map((t) => {
              const h = t.history;
              const m5 =
                h.length > 60
                  ? t.mcap / h[Math.max(0, h.length - 60)].mcap - 1
                  : 0;
              return (
                <button
                  key={t.id}
                  className="tick"
                  onClick={() => setSelectedToken(t.id)}
                >
                  {t.emoji} ${t.ticker}{" "}
                  <span className={m5 >= 0 ? "up" : "down"}>
                    {m5 >= 0 ? "+" : ""}
                    {(m5 * 100).toFixed(1)}%
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      <main className="layout">
        <div className="col-feed">
          {token && (
            <TokenDetail
              token={token}
              calls={world.calls}
              callers={world.callers}
              onClose={() => setSelectedToken(null)}
              onCall={() => setComposing(true)}
            />
          )}

          <nav className="tabs mono small">
            {(["ranked", "new", "top"] as Tab[]).map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t === "ranked" ? "▮ ranked" : t === "new" ? "◷ new" : "◎ top earning"}
              </button>
            ))}
            <span className="spacer" />
            <span className="muted">
              ranker: engagement heads · diversity rules · cold-start math —
              open, not a black box
            </span>
          </nav>

          <div className="tape">
            {feed.map((ranked, i) => (
              <CallCard
                key={ranked.call.id}
                ranked={ranked}
                rank={i + 1}
                token={world.tokens.get(ranked.call.tokenId)}
                caller={world.callers.get(ranked.call.callerId)}
                onOpenToken={setSelectedToken}
              />
            ))}
            {feed.length === 0 && (
              <div className="muted center">tape is empty. make the first call.</div>
            )}
          </div>
        </div>

        <aside className="col-side">
          <TokenBoard
            tokens={[...world.tokens.values()]}
            calls={world.calls}
            selected={selectedToken}
            onSelect={setSelectedToken}
          />
          <Leaderboard callers={[...world.callers.values()]} />
          <YourCalls
            calls={world.calls}
            tokens={world.tokens}
            onOpenToken={setSelectedToken}
          />
        </aside>
      </main>

      <footer className="footer muted small">
        signal — no seeded feed, no fake users*, the real tape ranked in the
        open. make a call. climb the board. get paid.{" "}
        <span className="mono">
          *this build runs a local market simulation; wire a live firehose in
          src/engine/market.ts
        </span>
      </footer>

      {composing && (
        <MakeCall
          tokens={[...world.tokens.values()]}
          initialTokenId={selectedToken}
          onClose={() => setComposing(false)}
          onDone={(tokenId) => {
            setComposing(false);
            setSelectedToken(tokenId);
          }}
        />
      )}
    </div>
  );
}
