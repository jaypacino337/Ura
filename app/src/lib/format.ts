import { ONE_URA } from "../game/constants";

/** Format base units as URA with sensible precision. */
export function fmtUra(amount: bigint, decimals = 3): string {
  const whole = amount / ONE_URA;
  const frac = amount % ONE_URA;
  if (decimals === 0) return whole.toLocaleString();
  const fracStr = (frac + ONE_URA)
    .toString()
    .slice(1)
    .slice(0, decimals)
    .replace(/0+$/, "");
  const wholeStr = whole.toLocaleString();
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

export function fmtHashrate(hps: number): string {
  if (hps >= 1_000_000) return `${(hps / 1_000_000).toFixed(2)} MH/s`;
  if (hps >= 1_000) return `${(hps / 1_000).toFixed(1)} kH/s`;
  return `${Math.round(hps)} H/s`;
}

export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}
