import { useEffect, useRef } from "react";
import { fmtMcap } from "../engine/market";
import type { Call, Caller, Token } from "../engine/types";

/**
 * Canvas mcap chart with callers plotted at their entries — the signature
 * feature: you see exactly where every caller pulled the trigger.
 */
export function TokenChart({
  token,
  calls,
  callers,
  height = 260,
}: {
  token: Token;
  calls: Call[];
  callers: Map<string, Caller>;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ token, calls, callers });
  propsRef.current = { token, calls, callers };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const draw = () => {
      const { token, calls, callers } = propsRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const hist = token.history;
      if (hist.length < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const t0 = hist[0].t;
      const t1 = hist[hist.length - 1].t;
      const lo = Math.min(...hist.map((p) => p.mcap)) * 0.92;
      const hi = Math.max(...hist.map((p) => p.mcap)) * 1.08;
      const X = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * (w - 60) + 8;
      const Y = (m: number) => h - 24 - ((m - lo) / (hi - lo)) * (h - 48);

      // Grid.
      ctx.strokeStyle = "rgba(88,245,176,0.07)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        const y = (h / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Area fill under the line.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      const up = hist[hist.length - 1].mcap >= hist[0].mcap;
      const line = up ? "#58f5b0" : "#f55a6a";
      grad.addColorStop(0, up ? "rgba(88,245,176,0.22)" : "rgba(245,90,106,0.2)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      hist.forEach((p, i) =>
        i === 0 ? ctx.moveTo(X(p.t), Y(p.mcap)) : ctx.lineTo(X(p.t), Y(p.mcap))
      );
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.lineTo(X(t1), h);
      ctx.lineTo(X(t0), h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Live price marker + label.
      const last = hist[hist.length - 1];
      ctx.beginPath();
      ctx.arc(X(last.t), Y(last.mcap), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = line;
      ctx.fill();
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillStyle = line;
      ctx.textAlign = "left";
      ctx.fillText(fmtMcap(last.mcap), Math.min(X(last.t) + 8, w - 52), Y(last.mcap) + 4);

      // Caller entry markers.
      const tokenCalls = calls.filter(
        (c) => c.tokenId === token.id && c.createdAt >= t0
      );
      let labelFlip = 0;
      for (const call of tokenCalls) {
        const caller = callers.get(call.callerId);
        const cx = X(call.createdAt);
        const cy = Y(Math.min(Math.max(call.entryMcap, lo), hi));
        // Stagger labels so tightly-clustered entries stay readable.
        const labelDy = [-11, -24, 18][labelFlip++ % 3];
        const hue = caller?.avatarHue ?? 0;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx + 6, cy + 4);
        ctx.lineTo(cx - 6, cy + 4);
        ctx.closePath();
        ctx.fillStyle = caller?.isUser
          ? "#58f5b0"
          : `hsl(${hue} 75% 55%)`;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.stroke();
        if (caller) {
          ctx.font = "10px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = caller.isUser ? "#58f5b0" : `hsl(${hue} 70% 70%)`;
          ctx.fillText(`@${caller.handle.slice(0, 10)}`, cx, cy + labelDy);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={ref} className="chart" style={{ height }} aria-label="mcap chart" />
  );
}
