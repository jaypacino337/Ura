export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function fmtX(x: number): string {
  if (x >= 10) return `${x.toFixed(0)}x`;
  return `${x.toFixed(2)}x`;
}

export function fmtSol(sol: number): string {
  if (sol >= 1) return `${sol.toFixed(2)} SOL`;
  if (sol >= 0.001) return `${sol.toFixed(3)} SOL`;
  return sol > 0 ? `${(sol * 1000).toFixed(2)} mSOL` : "0 SOL";
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case "S":
      return "var(--mint)";
    case "A":
      return "#8ef58a";
    case "B":
      return "#d8f56a";
    case "C":
      return "#f5d76a";
    case "D":
      return "#f5a05a";
    default:
      return "#f55a5a";
  }
}
