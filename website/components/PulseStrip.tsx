'use client';

/**
 * Live pulse (redesign point 3): a thin full-width activity strip right under
 * the breadcrumb — last 14 days of moderation actions as an area sparkline
 * with a pulsing live dot. Refreshes every 30 s; renders nothing until data
 * arrives and hides itself entirely for servers with zero recorded actions.
 */

import { useEffect, useState } from 'react';

interface TrendDay { date: string; count: number; }

export default function PulseStrip({ guildId }: { guildId: string }) {
  const [days, setDays] = useState<TrendDay[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/guild/${guildId}/trends?days=14`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d?.perDay) setDays(d.perDay); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [guildId]);

  if (!days || days.length < 2) return null;
  const total = days.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  const W = 100, H = 26;
  const max = Math.max(1, ...days.map((d) => d.count));
  const pts = days.map((d, i) => `${(i / (days.length - 1)) * W},${H - 3 - (d.count / max) * (H - 8)}`);
  const today = days[days.length - 1].count;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '7px 24px', background: '#0e0e11', borderBottom: '1px solid #1a1a1e' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#52535a', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#23a55a', animation: 'lp-pulse-dot 1.8s ease-in-out infinite' }} />
        Live
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ flex: 1, height: H, minWidth: 0 }}>
        <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill="rgba(88,101,242,0.14)" />
        <polyline points={pts.join(' ')} fill="none" stroke="#5865f2" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <span style={{ fontSize: 11.5, color: '#6d6f78', flexShrink: 0 }}>
        <b style={{ color: '#f2f3f5' }}>{total}</b> actions · 14d
        {today > 0 && <span style={{ color: '#23a55a' }}> · {today} today</span>}
      </span>
      <style>{`@keyframes lp-pulse-dot { 0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(35,165,90,0.5); } 50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(35,165,90,0); } }`}</style>
    </div>
  );
}
