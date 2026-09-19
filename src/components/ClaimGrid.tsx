import { useState } from "react";
import { plotCode, PLOTS, type Round } from "../engine/types";
import { store } from "../engine/useWorld";
import type { World } from "../engine/store";
import { GRADE_COLOR, GRADE_LABEL } from "../lib/fmt";

/**
 * The geological survey: a 5×5 field of uranium claims. Claim during OPEN,
 * watch the reveal at settlement — the strike plot lights up hot.
 */
export function ClaimGrid({
  world,
  onError,
}: {
  world: World;
  onError: (msg: string) => void;
}) {
  const r = world.round;
  const [flash, setFlash] = useState<number | null>(null);

  const claim = (i: number) => {
    const err = store.stakeClaim(i);
    if (err) onError(err);
    else {
      setFlash(i);
      setTimeout(() => setFlash(null), 400);
    }
  };

  return (
    <div className={`grid-wrap ${r.status}`}>
      <div className="grid-frame">
        <div className="grid-axis-x mono">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div className="grid-axis-y mono">
          {["A", "B", "C", "D", "E"].map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="grid">
          {Array.from({ length: PLOTS }, (_, i) => (
            <Plot
              key={i}
              i={i}
              round={r}
              world={world}
              flashing={flash === i}
              onClaim={() => claim(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Plot({
  i,
  round,
  world,
  flashing,
  onClaim,
}: {
  i: number;
  round: Round;
  world: World;
  flashing: boolean;
  onClaim: () => void;
}) {
  const claimants = round.claims[i];
  const mine = claimants.includes("you");
  const settled = round.status === "settled" && round.result;
  const grade = settled ? round.result!.grades[i] : null;
  const isStrike = settled && round.result!.strike === i;
  const hinted = round.status !== "settled" && round.surveyHints.includes(i);

  // Cosmetic per-plot background radiation reading, stable per round+plot.
  const reading = (0.04 + ((i * 2654435761 + round.id * 97) % 97) / 400).toFixed(2);

  return (
    <button
      className={[
        "plot",
        mine ? "plot-mine" : "",
        hinted ? "plot-hint" : "",
        settled ? `plot-${grade}` : "",
        isStrike ? "plot-strike" : "",
        flashing ? "plot-flash" : "",
      ].join(" ")}
      onClick={onClaim}
      disabled={round.status !== "open"}
      title={hinted ? "Survey: no anomaly detected (true reading)" : undefined}
    >
      <span className="plot-code mono">{plotCode(i)}</span>
      <span className="plot-reading mono">{settled ? "" : `${reading} mR/h`}</span>

      {settled ? (
        <span className="plot-grade mono" style={{ color: GRADE_COLOR[grade!] }}>
          {isStrike && <span className="trefoil">☢ </span>}
          {GRADE_LABEL[grade!]}
        </span>
      ) : (
        <span className="plot-claims">
          {claimants.slice(0, 6).map((id) => {
            const p = world.prospectors.get(id);
            return (
              <span
                key={id}
                className={`claim-dot ${id === "you" ? "claim-you" : ""}`}
                style={{ background: `hsl(${p?.hue ?? 0} 70% 50%)` }}
                title={`@${p?.handle}`}
              />
            );
          })}
          {claimants.length > 6 && (
            <span className="mono plot-more">+{claimants.length - 6}</span>
          )}
        </span>
      )}
      {hinted && !settled && <span className="hint-tag mono">SURVEYED</span>}
      {mine && !settled && <span className="mine-tag mono">YOUR CLAIM</span>}
    </button>
  );
}
