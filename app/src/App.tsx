import { useCallback } from "react";
import { MiningRig } from "./components/MiningRig";
import {
  ActionsPanel,
  EpochPanel,
  FindsFeed,
  Leaderboard,
  RoundStatus,
  StatsPanel,
} from "./components/Panels";
import { useGame } from "./game/useGame";
import { shortAddr } from "./lib/format";
import { useMiner } from "./miner/useMiner";

export default function App() {
  const game = useGame();
  const {
    mode,
    setMode,
    backend,
    address,
    config,
    proof,
    walletUra,
    leaderboard,
    toasts,
    toast,
    finds,
    recordFind,
    busy,
    connect,
    register,
    act,
  } = game;

  const onError = useCallback(
    (msg: string) => toast("error", msg),
    [toast]
  );
  const miner = useMiner(backend, recordFind, onError);

  const mining = miner.status.running;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-gem">◆</span>
          <span className="brand-name">URA MINE</span>
          <span className="brand-tag">proof-of-work on Solana</span>
        </div>
        <div className="topbar-right">
          <div className="mode-toggle" role="tablist" aria-label="Network">
            <button
              className={mode === "demo" ? "active" : ""}
              onClick={() => setMode("demo")}
            >
              Demo
            </button>
            <button
              className={mode === "devnet" ? "active" : ""}
              onClick={() => setMode("devnet")}
            >
              Devnet
            </button>
          </div>
          {address ? (
            <span className="wallet mono">{shortAddr(address)}</span>
          ) : (
            <button className="btn btn-gold" onClick={connect}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      <main className="layout">
        <div className="col-main">
          <section className="card card-rig">
            <MiningRig status={miner.status} latestFind={finds[0] ?? null} />
            <div className="rig-controls">
              {!address && mode === "devnet" ? (
                <p className="muted center">
                  Connect a wallet to mine on devnet — or flip to Demo mode and
                  start digging instantly.
                </p>
              ) : !proof && address ? (
                <button
                  className="btn btn-gold btn-big"
                  disabled={busy}
                  onClick={register}
                >
                  ⛏️ Register miner
                </button>
              ) : proof ? (
                <button
                  className={`btn btn-big ${mining ? "btn-stop" : "btn-gold"}`}
                  onClick={mining ? miner.stop : miner.start}
                >
                  {mining ? "■ Stop drilling" : "⛏️ Start mining"}
                </button>
              ) : null}
              <RoundStatus status={miner.status} />
            </div>
          </section>
          <FindsFeed finds={finds} />
          <section className="card how">
            <h3>How it works</h3>
            <ol>
              <li>
                Your browser hashes <span className="mono">keccak256</span>{" "}
                nonces against your personal challenge in a background worker —
                real proof-of-work, like Ore.
              </li>
              <li>
                More leading zero bits = exponentially bigger reward. The best
                hash found each round is submitted when the cooldown opens.
              </li>
              <li>
                Claim URA to your wallet, then stake it to boost your
                multiplier. Keep rounds back-to-back to build a streak bonus.
              </li>
              <li>
                Difficulty retargets every epoch to hold emissions on schedule
                — 21M URA hard cap, ever.
              </li>
            </ol>
          </section>
        </div>

        <div className="col-side">
          {proof && <StatsPanel proof={proof} walletUra={walletUra} />}
          {proof && (
            <ActionsPanel
              proof={proof}
              walletUra={walletUra}
              busy={busy}
              onClaim={() =>
                act(() => backend.claim(proof.balance), "URA claimed to wallet")
              }
              onStake={(amt) =>
                act(() => backend.stake(amt), "Staked — multiplier boosted")
              }
              onUnstake={(amt) => act(() => backend.unstake(amt), "Unstaked")}
            />
          )}
          {config && <EpochPanel config={config} />}
          <Leaderboard entries={leaderboard} />
        </div>
      </main>

      <footer className="footer muted small">
        URA Mine — an Ore-style mining game. Demo mode simulates the ledger
        locally with real PoW; Devnet mode talks to the on-chain program.
      </footer>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
