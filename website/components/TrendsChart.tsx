'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp } from 'lucide-react';

interface TrendDay { date: string; warned: number; kicked: number; banned: number; timeout: number; count: number; }
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

function dayLabel(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'short' })[0];
}

export default function TrendsChart({ guildId }: { guildId: string }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/trends?days=${d}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [guildId]);

  useEffect(() => { load(days); }, [days, load]);

  const card = (children: React.ReactNode, title: string, right?: React.ReactNode) => (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>{title}</span>
        {right}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
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

  const max = Math.max(1, ...(data?.perDay ?? []).map((d) => d.count));
  const reasonMax = Math.max(1, ...(data?.topReasons ?? []).map((r) => r.count));

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
            {/* Bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.perDay.length > 16 ? 2 : 4, height: 140 }}>
              {data.perDay.map((d) => (
                <div key={d.date} title={`${d.date}: ${d.count}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <div style={{ width: '100%', maxWidth: 26, display: 'flex', flexDirection: 'column-reverse', height: `${(d.count / max) * 110}px`, minHeight: d.count > 0 ? 3 : 0, borderRadius: 3, overflow: 'hidden', background: '#18181b' }}>
                    {KINDS.map(({ key, color }) => {
                      const v = d[key] as number;
                      if (!v) return null;
                      return <div key={key} style={{ height: `${(v / d.count) * 100}%`, background: color }} />;
                    })}
                  </div>
                  {days <= 14 && (
                    <span style={{ fontSize: 9, color: '#52535a' }}>{dayLabel(d.date)}</span>
                  )}
                </div>
              ))}
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
