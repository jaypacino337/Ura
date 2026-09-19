import type { World } from "../engine/store";
import { reserveValueUsd } from "./Panels";
import { fmtAmt, fmtCountdown, fmtUsd } from "../lib/fmt";

export function TerminalHeader({ world }: { world: World }) {
  const r = world.round;
  const active = new Set(
    r.claims.flatMap((c) => c).concat(world.history[0]?.claims.flat() ?? [])
  ).size;
  const uraniumExposure = world.reserve.nne * world.nnePrice; // + xU3O8 when live
  const stats: [string, string][] = [
    ["RESERVE VALUE", `$${fmtUsd(reserveValueUsd(world))}`],
    ["URANIUM EXPOSURE", `$${fmtUsd(uraniumExposure)}`],
    ["NNE HOLDINGS", `${fmtAmt(world.reserve.nne, 3)}`],
    ["MINING ROUND", `#${r.id}`],
    ["ACTIVE PROSPECTORS", `${active}`],
    ["ORE DISCOVERED", `${fmtUsd(world.oreDiscovered)} U`],
    [
      "NEXT ROUND",
      r.status === "settled"
        ? "SPINNING UP"
        : fmtCountdown(r.settlesAt - Date.now()),
    ],
  ];
  return (
    <header className="term-head">
      <div className="masthead">
        <div className="brand mono">
          <span className="trefoil-big">☢</span>
          <span className="brand-name">URANIUM STRATEGY RESERVE</span>
          <span className="ticker-sym">$USR</span>
        </div>
        <div className="tagline mono small">
          MINE URANIUM. BUILD THE RESERVE. — DEPT. OF DEGENERATE ENERGY ·
          FIELD TERMINAL 03
        </div>
        <div className="geiger mono small">
          <span className="geiger-needle" />
          RADIATION SURVEY: <b>{world.cpm} CPM</b>
          <span className={world.cpm > 120 ? "hot" : "ok"}>
            {world.cpm > 120 ? " ▲ ANOMALY" : " NOMINAL"}
          </span>
        </div>
      </div>
      <div className="statbar mono small">
        {stats.map(([k, v]) => (
          <span className="stat" key={k}>
            <span className="dim">{k}</span> <b>{v}</b>
          </span>
        ))}
      </div>
    </header>
  );
}
