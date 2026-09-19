export function fmtUsd(v: number, digits = 0): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtAmt(v: number, digits = 3): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function shortHash(h: string, n = 10): string {
  return `${h.slice(0, n)}…${h.slice(-4)}`;
}

export const GRADE_LABEL: Record<string, string> = {
  BARREN: "BARREN",
  TRACE: "TRACE",
  ORE: "ORE",
  HIGH_GRADE: "HIGH-GRADE",
  MOTHERLODE: "MOTHERLODE",
};

export const GRADE_COLOR: Record<string, string> = {
  BARREN: "var(--dim)",
  TRACE: "#8a9a6a",
  ORE: "#b8d24a",
  HIGH_GRADE: "#ffd400",
  MOTHERLODE: "var(--hot)",
};
