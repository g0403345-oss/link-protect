'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, BarChart3, ChevronUp, ChevronDown } from 'lucide-react';

interface StatsResponse {
  current: Record<string, number>;
  totalServers: number;
  history: ({ day: string; _total: number } & Record<string, number | string>)[];
}

const KEY_META: { key: string; label: string; color: string }[] = [
  { key: 'protect.all',        label: 'Block All Links',   color: '#5865f2' },
  { key: 'protect.malware',    label: 'Malware/Phishing',  color: '#f23f43' },
  { key: 'protect.nitro',      label: 'Nitro Scams',       color: '#eb459e' },
  { key: 'protect.nsfw',       label: 'NSFW',              color: '#e0683c' },
  { key: 'protect.invite',     label: 'Discord Invites',   color: '#f0b232' },
  { key: 'protect.youtube',    label: 'YouTube',           color: '#d4483b' },
  { key: 'protect.google',     label: 'Google',            color: '#4c8bf5' },
  { key: 'protect.gif',        label: 'GIFs',              color: '#8b5cf6' },
  { key: 'protect.twitch',     label: 'Twitch',            color: '#9146ff' },
  { key: 'protect.steam',      label: 'Steam',             color: '#66c0f4' },
  { key: 'protect.bit',        label: 'URL Shorteners',    color: '#23a55a' },
  { key: 'scamguard.enabled',  label: 'Scam Shield',       color: '#f97316' },
  { key: 'scamguard.join_check', label: 'Join Check',      color: '#fbbf24' },
  { key: 'raid.enabled',       label: 'Raid Protection',   color: '#dc2626' },
  { key: 'silent',             label: 'Silent Mode',       color: '#94a3b8' },
  { key: 'decay.enabled',      label: 'Warning Decay',     color: '#22d3ee' },
  { key: 'log.Activated',      label: 'Warn Log',          color: '#a3e635' },
];

/** Adoption overview: how many servers run each protection, with a daily
 *  history chart (snapshots are taken server-side every 6h). */
export default function AdminProtectionStats() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Chart series toggles — start with the most interesting ones.
  const [selected, setSelected] = useState<string[]>(['protect.all', 'protect.malware', 'scamguard.enabled', 'raid.enabled']);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    fetch('/api/admin/protection-stats?days=90')
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(true); else setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (k: string) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  // Change vs. ~7 days ago: baseline is the newest snapshot that is at least
  // 7 days old — or the oldest one we have while the history is still young.
  const deltas = useMemo(() => {
    if (!data || data.history.length < 2) return {} as Record<string, number>;
    const days = data.history;
    const latest = days[days.length - 1];
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    let base = days[0];
    for (const d of days) { if (d.day <= cutoff) base = d; else break; }
    if (base.day === latest.day) base = days[0];
    if (base.day === latest.day) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const { key } of KEY_META) {
      out[key] = (data.current[key] ?? 0) - Number(base[key] ?? 0);
    }
    return out;
  }, [data]);

  const chart = useMemo(() => {
    if (!data || data.history.length === 0) return null;
    const W = 860, H = 260, PAD_L = 44, PAD_B = 26, PAD_T = 10, PAD_R = 10;
    const days = data.history;
    const maxVal = Math.max(10, ...days.flatMap((d) => selected.map((k) => Number(d[k] ?? 0))));
    const x = (i: number) => PAD_L + (days.length === 1 ? (W - PAD_L - PAD_R) / 2 : (i / (days.length - 1)) * (W - PAD_L - PAD_R));
    const y = (v: number) => PAD_T + (1 - v / maxVal) * (H - PAD_T - PAD_B);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
    return { W, H, PAD_L, PAD_B, days, maxVal, x, y, ticks };
  }, [data, selected]);

  return (
    <div>
      {error && (
        <div style={{ padding: '20px 24px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#f87171' }}>
          Bot API unreachable.
        </div>
      )}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <RefreshCw size={18} color="#52535a" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {data && !loading && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <BarChart3 size={15} color="#5865f2" />
            <span style={{ fontSize: 13, color: '#949ba4' }}>
              <b style={{ color: '#f2f3f5' }}>{data.totalServers.toLocaleString()}</b> configured servers ·
              snapshots every 6h — the chart grows day by day
            </span>
            <button onClick={load} style={{ marginLeft: 'auto', width: 34, height: 30, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <RefreshCw size={13} color="#6d6f78" />
            </button>
          </div>

          {/* current adoption grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8, marginBottom: 20 }}>
            {KEY_META.map(({ key, label, color }) => {
              const n = data.current[key] ?? 0;
              const pct = data.totalServers ? Math.round((n / data.totalServers) * 100) : 0;
              const active = selected.includes(key);
              return (
                <button key={key} onClick={() => toggle(key)} title="Toggle in chart"
                  style={{ textAlign: 'left', background: '#111113', border: `1px solid ${active ? color : '#1e1e22'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#f2f3f5' : '#949ba4', lineHeight: 1.2 }}>{label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color }}>{n.toLocaleString()}</span>
                    <span style={{ fontSize: 11, color: '#52535a' }}>{pct}%</span>
                    {(deltas[key] ?? 0) !== 0 && (
                      <span title="Change vs. 7 days ago"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 1, marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: deltas[key] > 0 ? '#23a55a' : '#f23f43' }}>
                        {deltas[key] > 0 ? <ChevronUp size={12} strokeWidth={3} /> : <ChevronDown size={12} strokeWidth={3} />}
                        {Math.abs(deltas[key])}
                      </span>
                    )}
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: '#1e1e22', marginTop: 7, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* history chart */}
          <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#949ba4', marginBottom: 10 }}>
              Adoption over time <span style={{ fontWeight: 400, color: '#52535a' }}>— click the tiles above to add/remove lines</span>
            </div>
            {!chart || chart.days.length < 2 ? (
              <p style={{ fontSize: 13, color: '#52535a', padding: '18px 0' }}>
                Not enough history yet — snapshots started today, the chart appears from tomorrow on.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <svg viewBox={`0 0 ${chart.W} ${chart.H}`} style={{ width: '100%', minWidth: 560, display: 'block' }}>
                  {chart.ticks.map((t) => (
                    <g key={t}>
                      <line x1={chart.PAD_L} x2={chart.W - 10} y1={chart.y(t)} y2={chart.y(t)} stroke="#1e1e22" strokeWidth={1} />
                      <text x={chart.PAD_L - 8} y={chart.y(t) + 3} textAnchor="end" fontSize={10} fill="#52535a">{t}</text>
                    </g>
                  ))}
                  {chart.days.map((d, i) => (
                    (chart.days.length <= 14 || i % Math.ceil(chart.days.length / 12) === 0) && (
                      <text key={d.day} x={chart.x(i)} y={chart.H - 8} textAnchor="middle" fontSize={9} fill="#52535a">
                        {d.day.slice(5)}
                      </text>
                    )
                  ))}
                  {KEY_META.filter((k) => selected.includes(k.key)).map(({ key, color }) => {
                    const pts = chart.days.map((d, i) => `${chart.x(i)},${chart.y(Number(d[key] ?? 0))}`).join(' ');
                    return (
                      <g key={key}>
                        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        {chart.days.map((d, i) => (
                          <circle key={i} cx={chart.x(i)} cy={chart.y(Number(d[key] ?? 0))} r={2.5} fill={color}>
                            <title>{`${d.day}: ${d[key] ?? 0}`}</title>
                          </circle>
                        ))}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
