import { useCallback, useState } from "react";
import { ClaimGrid } from "./components/ClaimGrid";
import {
  DocsPanel,
  LeaderboardPanel,
  OperationPanel,
  ReservePanel,
  StrategyPanel,
} from "./components/Panels";
import { GradeLegend, HistoryPanel, RoundPanel } from "./components/RoundPanels";
import { TerminalHeader } from "./components/TerminalHeader";
import { useWorld } from "./engine/useWorld";

interface Toast {
  id: number;
  text: string;
}
let toastId = 1;

export default function App() {
  const { world } = useWorld();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const onError = useCallback((text: string) => {
    const id = toastId++;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <div className="shell">
      <TerminalHeader world={world} />

      <main className="layout">
        <div className="col-main">
          <RoundPanel world={world} />
          <ClaimGrid world={world} onError={onError} />
          <GradeLegend />
          <div className="duo">
            <StrategyPanel world={world} />
            <DocsPanel />
          </div>
        </div>
        <aside className="col-side">
          <ReservePanel world={world} />
          <OperationPanel world={world} onError={onError} />
          <HistoryPanel world={world} />
          <LeaderboardPanel world={world} />
        </aside>
      </main>

      <footer className="footer dim small mono">
        URANIUM STRATEGY RESERVE — prototype terminal. Market data, fees and
        settlements are simulated; randomness is commit-reveal and verifiable
        in-browser. No physical uranium backing is claimed. Free permits only —
        no deposits buy entries. Pons/onchain wiring lands at the seams in
        src/engine.
      </footer>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast mono small">
            ⚠ {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
