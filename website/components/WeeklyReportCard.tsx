'use client';

/**
 * Weekly report (Premium) — the last 7 days at a glance: totals with deltas
 * vs the week before, top users/reasons and a per-day bar strip. Printable
 * (window.print → the wrapper stays visible, the rest of the page hides).
 */

import { useEffect, useState } from 'react';
import { Printer, TrendingDown, TrendingUp } from 'lucide-react';
import PremiumLockNote from '@/components/PremiumLockNote';

interface WeeklyReport {
  generatedAt: number;
  totals: Record<string, number>;
  previousTotals: Record<string, number>;
  total: number;
  previousTotal: number;
  topUsers: { userId: string; username: string; count: number }[];
  topReasons: { reason: string; count: number }[];
  perDay: { date: string; count: number }[];
}

const ACTION_META: Record<string, { label: string; color: string }> = {
  warned:  { label: 'Warned',  color: '#f0b232' },
  unwarned: { label: 'Removed', color: '#23a55a' },
  kicked:  { label: 'Kicked',  color: '#e0683c' },
  banned:  { label: 'Banned',  color: '#f23f43' },
  timeout: { label: 'Timeout', color: '#5865f2' },
};

export default function WeeklyReportCard({ guildId }: { guildId: string }) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'locked' | 'error'>('loading');

  // The card body unmounts while collapsed, so mounting = expanding — this
  // fetch only fires once the card is actually opened.
  useEffect(() => {
    fetch(`/api/guild/${guildId}/report/weekly`)
      .then(async (r) => {
        if (r.status === 403) { setState('locked'); return; }
        if (!r.ok) { setState('error'); return; }
        const d = await r.json();
        setReport(d as WeeklyReport);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [guildId]);

  if (state === 'loading') return <p style={{ fontSize: 13, color: '#52535a' }}>Building your report…</p>;
  if (state === 'locked') {
    return <PremiumLockNote text="📊 Weekly moderation report with trends & print export — a 💎 Premium extra. Protection itself stays free." />;
  }
  if (state === 'error' || !report) return <p style={{ fontSize: 13, color: '#f23f43' }}>Could not load the report — try again later.</p>;

  const delta = report.total - report.previousTotal;
  const deltaColor = delta > 0 ? '#f23f43' : '#23a55a';
  const maxDay = Math.max(1, ...report.perDay.map((d) => d.count));

  return (
    <div>
      <div className="lp-print-area">
        {/* Headline total + delta */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.02em' }}>
            {report.total.toLocaleString()}
          </span>
          <span style={{ fontSize: 13, color: '#6d6f78' }}>moderation actions this week</span>
          {delta !== 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: deltaColor }}>
              {delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {delta > 0 ? `+${delta}` : delta} vs last week
            </span>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: '#52535a', marginBottom: 16 }}>
          Generated {new Date(report.generatedAt * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {' · '}last week: {report.previousTotal.toLocaleString()}
        </p>

        {/* Per-action totals with deltas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 18 }}>
          {Object.entries(ACTION_META).map(([action, meta]) => {
            const now = report.totals[action] ?? 0;
            const prev = report.previousTotals[action] ?? 0;
            if (now === 0 && prev === 0) return null;
            const d = now - prev;
            return (
              <div key={action} style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#6d6f78', fontWeight: 600 }}>{meta.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#f2f3f5' }}>{now.toLocaleString()}</span>
                  {d !== 0 && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: d > 0 ? '#f23f43' : '#23a55a' }}>
                      {d > 0 ? `+${d} ↑` : `${d} ↓`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-day bar strip — one series, direct day labels, tooltip per bar */}
        {report.perDay.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 8 }}>Actions per day</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
              {report.perDay.map((d) => (
                <div key={d.date} title={`${d.date}: ${d.count} action${d.count !== 1 ? 's' : ''}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%', cursor: 'default' }}>
                  <span style={{ fontSize: 10, color: '#6d6f78', fontWeight: 600 }}>{d.count > 0 ? d.count : ''}</span>
                  <div style={{ width: '100%', maxWidth: 34, height: Math.max(2, (d.count / maxDay) * 34), background: d.count > 0 ? '#5865f2' : '#2e2e36', borderRadius: '4px 4px 0 0' }} />
                  <span style={{ fontSize: 9.5, color: '#52535a', fontWeight: 600 }}>
                    {new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top users + top reasons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 8 }}>Most-actioned members</div>
            {report.topUsers.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#52535a' }}>Nobody — a quiet week.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {report.topUsers.map((u, i) => (
                  <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: i === 0 ? '#f0b232' : '#52535a', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.username || `…${u.userId.slice(-4)}`}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#949ba4', flexShrink: 0 }}>{u.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 8 }}>Top reasons</div>
            {report.topReasons.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#52535a' }}>No reasons recorded.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {report.topReasons.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#b5bac1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#949ba4', flexShrink: 0 }}>{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print / PDF */}
      <div className="no-print" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #1e1e22' }}>
        <button onClick={() => window.print()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#f2f3f5', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
          <Printer size={13} /> Print / save as PDF
        </button>
      </div>

      {/* When printing, only the report survives — everything else hides. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .lp-print-area, .lp-print-area * { visibility: visible; }
          .lp-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
        }
      `}</style>
    </div>
  );
}
