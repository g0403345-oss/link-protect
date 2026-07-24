'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, ShieldAlert, Zap } from 'lucide-react';
import CollapsibleCard, { cardKey } from '@/components/CollapsibleCard';

interface TrendDay {
  date: string; warned: number; kicked: number; banned: number; timeout: number; count: number;
  /** Event markers (backend classifies by reason) — 0 on older API responses. */
  scamshield?: number; raid?: number;
}
interface TrendReason { reason: string; count: number; }
interface Trends {
  days: number; total: number; perDay: TrendDay[]; topReasons: TrendReason[];
  totals: { warned: number; kicked: number; banned: number; timeout: number };
}

type Kind = 'warned' | 'kicked' | 'banned' | 'timeout';
const KINDS: { key: Kind; label: string; color: string }[] = [
  { key: 'warned', label: 'Warned', color: '#f0b232' },
  { key: 'kicked', label: 'Kicked', color: '#e0683c' },
  { key: 'banned', label: 'Banned', color: '#f23f43' },
  { key: 'timeout', label: 'Timeout', color: '#5865f2' },
];

const RANGES = [7, 14, 30];
const BAR_AREA = 110; // px height of the tallest bar

function dayLabel(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'short' })[0];
}

function niceDate(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Round up to a "nice" axis maximum (1/2/5 × 10ⁿ). */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

export default function TrendsChart({ guildId }: { guildId: string }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/trends?days=${d}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [guildId]);

  useEffect(() => { load(days); }, [days, load]);

  const card = (children: React.ReactNode, title: string, right?: React.ReactNode) => (
    <CollapsibleCard title={title} right={right} storageKey={cardKey('trends', title.replace(/ — .*$/, ''))}>
      {children}
    </CollapsibleCard>
  );

  const rangePicker = (
    <div style={{ display: 'flex', gap: 4, background: '#18181b', borderRadius: 7, padding: 3 }}>
      {RANGES.map((r) => (
        <button key={r} onClick={() => setDays(r)}
          style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 5, border: 'none', cursor: 'pointer',
            background: days === r ? '#5865f2' : 'transparent', color: days === r ? '#fff' : '#6d6f78' }}>
          {r}d
        </button>
      ))}
    </div>
  );

  const axisMax = niceMax(Math.max(1, ...(data?.perDay ?? []).map((d) => d.count)));
  const reasonMax = Math.max(1, ...(data?.topReasons ?? []).map((r) => r.count));
  const gridLevels = [axisMax, axisMax / 2];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {card(
        loading && !data ? (
          <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 24, height: 24, border: '2px solid #5865f2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !data || data.total === 0 ? (
          <div style={{ height: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <TrendingUp size={26} color="#2e2e36" />
            <p style={{ fontSize: 13, color: '#52535a' }}>No moderation activity in this period</p>
          </div>
        ) : (
          <>
            {/* Chart area: y-axis labels + gridlines behind the bars */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', width: 26, height: BAR_AREA + 30, flexShrink: 0 }}>
                {gridLevels.map((lv) => (
                  <span key={lv} style={{ position: 'absolute', right: 2, top: 12 + (BAR_AREA - (lv / axisMax) * BAR_AREA) - 6, fontSize: 9, color: '#52535a', fontVariantNumeric: 'tabular-nums' }}>
                    {lv}
                  </span>
                ))}
                <span style={{ position: 'absolute', right: 2, top: 12 + BAR_AREA - 6, fontSize: 9, color: '#52535a' }}>0</span>
              </div>
              <div style={{ position: 'relative', flex: 1 }}>
                {/* gridlines */}
                {[...gridLevels, 0].map((lv) => (
                  <div key={lv} style={{ position: 'absolute', left: 0, right: 0, top: 12 + (BAR_AREA - (lv / axisMax) * BAR_AREA), height: 1, background: lv === 0 ? '#2e2e36' : '#1e1e22' }} />
                ))}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.perDay.length > 16 ? 2 : 4, height: BAR_AREA + 12, paddingTop: 12, position: 'relative' }}>
                  {data.perDay.map((d, i) => {
                    const hasEvent = (d.scamshield ?? 0) > 0 || (d.raid ?? 0) > 0;
                    const hovered = hover === i;
                    return (
                      <div key={d.date}
                        onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 3, minWidth: 0, position: 'relative', cursor: 'default', height: '100%' }}>
                        {/* Tooltip */}
                        {hovered && (
                          <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: `translateX(${i === 0 ? '-20%' : i === data.perDay.length - 1 ? '-80%' : '-50%'})`, marginBottom: 6, background: '#1a1a1f', border: '1px solid #2e2e36', borderRadius: 8, padding: '8px 11px', zIndex: 20, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#f2f3f5', marginBottom: 4 }}>{niceDate(d.date)} · {d.count} action{d.count === 1 ? '' : 's'}</div>
                            {KINDS.map(({ key, label, color }) => {
                              const v = d[key] as number;
                              if (!v) return null;
                              return (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#949ba4', lineHeight: 1.6 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} /> {label}: <b style={{ color: '#f2f3f5' }}>{v}</b>
                                </div>
                              );
                            })}
                            {(d.scamshield ?? 0) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#f23f43', lineHeight: 1.6 }}>
                                <ShieldAlert size={9} /> Scam Shield: <b>{d.scamshield}</b>
                              </div>
                            )}
                            {(d.raid ?? 0) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#f0b232', lineHeight: 1.6 }}>
                                <Zap size={9} /> Raid defended: <b>{d.raid}</b>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Event marker */}
                        {hasEvent && (
                          <span title={(d.scamshield ?? 0) > 0 ? 'Scam Shield fired this day' : 'Raid defended this day'}
                            style={{ width: 5, height: 5, borderRadius: '50%', background: (d.scamshield ?? 0) > 0 ? '#f23f43' : '#f0b232', boxShadow: `0 0 6px ${(d.scamshield ?? 0) > 0 ? '#f23f43' : '#f0b232'}`, flexShrink: 0 }} />
                        )}
                        <div style={{ width: '100%', maxWidth: 26, display: 'flex', flexDirection: 'column-reverse', height: `${(d.count / axisMax) * BAR_AREA}px`, minHeight: d.count > 0 ? 3 : 0, borderRadius: 3, overflow: 'hidden', background: '#18181b', outline: hovered ? '1px solid #5865f2' : 'none', transition: 'opacity 0.1s', opacity: hover === null || hovered ? 1 : 0.45 }}>
                          {KINDS.map(({ key, color }) => {
                            const v = d[key] as number;
                            if (!v) return null;
                            return <div key={key} style={{ height: `${(v / d.count) * 100}%`, background: color }} />;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Day labels */}
                {days <= 14 && (
                  <div style={{ display: 'flex', gap: data.perDay.length > 16 ? 2 : 4, marginTop: 4 }}>
                    {data.perDay.map((d) => (
                      <span key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#52535a' }}>{dayLabel(d.date)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, paddingTop: 12, borderTop: '1px solid #1e1e22' }}>
              {KINDS.map(({ key, label, color }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
                  <span style={{ fontSize: 11, color: '#949ba4' }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f2f3f5' }}>{data.totals[key]}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f23f43', boxShadow: '0 0 5px #f23f43' }} />
                <span style={{ fontSize: 10.5, color: '#52535a' }}>Scam Shield</span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f0b232', boxShadow: '0 0 5px #f0b232', marginLeft: 6 }} />
                <span style={{ fontSize: 10.5, color: '#52535a' }}>Raid</span>
              </div>
            </div>
          </>
        ),
        `Activity — last ${days} days`,
        rangePicker
      )}

      {data && data.topReasons.length > 0 && card(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.topReasons.map((r) => (
            <div key={r.reason} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: '0 0 42%', fontSize: 12, color: '#949ba4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>
              <div style={{ flex: 1, height: 8, background: '#18181b', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.count / reasonMax) * 100}%`, background: '#5865f2', borderRadius: 99 }} />
              </div>
              <span style={{ flex: '0 0 28px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#f2f3f5' }}>{r.count}</span>
            </div>
          ))}
        </div>,
        'Top reasons'
      )}
    </div>
  );
}
