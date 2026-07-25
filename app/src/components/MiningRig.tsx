import { useEffect, useRef } from "react";
import type { MinerStatus } from "../miner/useMiner";
import { fmtHashrate } from "../lib/format";
import type { Find } from "../game/useGame";
import { fmtUra } from "../lib/format";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

interface Floater {
  x: number;
  y: number;
  life: number;
  text: string;
}

/**
 * The visual centerpiece: a canvas-rendered crystal core that pulses with
 * hashrate, throws sparks while mining, and erupts when a solution lands.
 */
export function MiningRig({
  status,
  latestFind,
}: {
  status: MinerStatus;
  latestFind: Find | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const particlesRef = useRef<Particle[]>([]);
  const floatersRef = useRef<Floater[]>([]);
  const lastFindRef = useRef<number | null>(null);

  // Eruption when a new find arrives.
  useEffect(() => {
    if (!latestFind || latestFind.id === lastFindRef.current) return;
    lastFindRef.current = latestFind.id;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        life: 1,
        maxLife: 60 + Math.random() * 50,
        size: 1.5 + Math.random() * 3.5,
        hue: 40 + Math.random() * 25,
      });
    }
    floatersRef.current.push({
      x: cx,
      y: cy - 40,
      life: 1,
      text: `+${fmtUra(latestFind.reward)} URA`,
    });
  }, [latestFind]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      t += 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const s = statusRef.current;
      const mining = s.phase === "hashing";
      const intensity = mining ? Math.min(1, s.hps / 400_000) + 0.35 : 0.12;

      ctx.clearRect(0, 0, w, h);

      // Ambient glow.
      const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.45);
      const pulse = 0.5 + 0.5 * Math.sin(t * (mining ? 0.09 : 0.02));
      glow.addColorStop(
        0,
        `rgba(255, 190, 80, ${0.16 * intensity + 0.08 * pulse * intensity})`
      );
      glow.addColorStop(1, "rgba(255,190,80,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Crystal core — a rotating hexagonal gem.
      const R = 46 + 5 * pulse * (mining ? 1.4 : 0.6);
      const rot = t * (mining ? 0.012 : 0.003);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      for (let layer = 3; layer >= 1; layer--) {
        const r = R * (layer / 3);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        const alpha = layer === 1 ? 0.95 : layer === 2 ? 0.35 : 0.15;
        ctx.fillStyle =
          layer === 1
            ? `rgba(255, 205, 100, ${alpha})`
            : `rgba(255, 170, 60, ${alpha * intensity})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 225, 160, ${0.5 * intensity})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // Spark emission while mining.
      if (mining && t % 2 === 0) {
        const count = Math.ceil(2 + intensity * 4);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.6 + Math.random() * 2.2 * intensity;
          particlesRef.current.push({
            x: cx + Math.cos(angle) * R * 0.8,
            y: cy + Math.sin(angle) * R * 0.8,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.4,
            life: 1,
            maxLife: 35 + Math.random() * 30,
            size: 1 + Math.random() * 2,
            hue: 35 + Math.random() * 30,
          });
        }
      }

      // Particles.
      const ps = particlesRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045;
        p.life -= 1 / p.maxLife;
        if (p.life <= 0) {
          ps.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${55 + 25 * p.life}%, ${p.life})`;
        ctx.fill();
      }
      if (ps.length > 500) ps.splice(0, ps.length - 500);

      // Floating reward text.
      const fs = floatersRef.current;
      for (let i = fs.length - 1; i >= 0; i--) {
        const f = fs[i];
        f.y -= 0.7;
        f.life -= 0.011;
        if (f.life <= 0) {
          fs.splice(i, 1);
          continue;
        }
        ctx.font = "700 22px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(120, 255, 170, ${f.life})`;
        ctx.shadowColor = "rgba(120,255,170,0.7)";
        ctx.shadowBlur = 12;
        ctx.fillText(f.text, f.x, f.y);
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const mining = status.phase === "hashing";
  return (
    <div className="rig">
      <canvas ref={canvasRef} className="rig-canvas" />
      <div className="rig-overlay">
        {mining && (
          <div className="rig-hashrate mono">{fmtHashrate(status.hps)}</div>
        )}
        {status.phase === "submitting" && (
          <div className="rig-hashrate mono glow-green">
            submitting solution…
          </div>
        )}
      </div>
    </div>
  );
}
