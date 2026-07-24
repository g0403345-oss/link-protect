'use client';

import { useEffect, useRef, useState } from 'react';

/* ── Confetti celebration (dependency-free canvas burst) ─────────────────── */

interface Particle {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  w: number; h: number; color: string; life: number;
}

const CONFETTI_COLORS = ['#5865f2', '#23a55a', '#f0b232', '#FFD700', '#eb459e', '#7fd8ff', '#f2f3f5'];

/** Full-screen confetti burst, fired once when `fire` flips to true. */
export function Celebration({ fire, onDone }: { fire: boolean; onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ran = useRef(false);
  // Callbacks live in a ref so parent re-renders (polling, fetches) never
  // change the effect deps — re-running the effect mid-flight cancelled the
  // rAF loop and left the confetti frozen on screen.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!fire || ran.current) return;
    ran.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = window.innerWidth;
    const H = window.innerHeight;
    const parts: Particle[] = [];
    // Two bursts from bottom corners + one from center-top for a full stage.
    const bursts: [number, number, number][] = [[W * 0.2, H * 0.85, -0.6], [W * 0.8, H * 0.85, 0.6], [W * 0.5, H * 0.3, 0]];
    for (const [bx, by, tilt] of bursts) {
      for (let i = 0; i < 60; i++) {
        const angle = -Math.PI / 2 + tilt + (Math.random() - 0.5) * 1.1;
        const speed = 7 + Math.random() * 9;
        parts.push({
          x: bx, y: by,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3,
          w: 5 + Math.random() * 5, h: 8 + Math.random() * 6,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          life: 1,
        });
      }
    }

    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = (t - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of parts) {
        p.vy += 0.22;          // gravity
        p.vx *= 0.992;         // drag
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - elapsed / 2.6);
        if (p.life <= 0 || p.y > H + 30) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life * 1.6);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, Math.max(1, p.h * Math.abs(Math.sin(p.rot))));
        ctx.restore();
      }
      if (alive > 0 && elapsed < 3) raf = requestAnimationFrame(tick);
      else { ctx.clearRect(0, 0, W, H); onDoneRef.current?.(); }
    };
    raf = requestAnimationFrame(tick);
    // Clear on teardown too — if the loop IS ever cancelled, never leave a
    // frozen frame behind.
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H); };
  }, [fire]);

  if (!fire) return null;
  return (
    <canvas ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 500 }} />
  );
}

/* ── Guild accent tint ────────────────────────────────────────────────────── */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

/** Average color of the server icon (Discord CDN sends CORS headers), boosted
 *  to a usable accent. Null while loading / when there is no icon. */
export function useGuildTint(guildId: string, icon: string | null | undefined): string | null {
  const [tint, setTint] = useState<string | null>(null);
  useEffect(() => {
    setTint(null);
    if (!icon) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://cdn.discordapp.com/icons/${guildId}/${icon}.webp?size=64`;
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const d = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 64) continue;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (!n) return;
        const [h, s] = rgbToHsl(r / n, g / n, b / n);
        // Grey icons keep the brand accent instead of a muddy tint.
        if (s < 0.08) return;
        setTint(`hsl(${Math.round(h)}, ${Math.round(Math.max(45, Math.min(85, s * 130)))}%, 60%)`);
      } catch { /* tainted canvas / CORS hiccup — no tint */ }
    };
  }, [guildId, icon]);
  return tint;
}
