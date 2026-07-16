'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, ShieldAlert, ShieldOff, Bug, MessageSquare, ShieldPlus,
  Check, Archive, ExternalLink,
} from 'lucide-react';
import type { Report, ReportType } from '@/lib/db';
import ReportThread from '@/components/ReportThread';

const TYPE_META: Record<ReportType, { label: string; color: string; icon: typeof Bug }> = {
  malicious_link: { label: 'Malicious link', color: '#f23f43', icon: ShieldAlert },
  false_positive: { label: 'False positive', color: '#f0b232', icon: ShieldOff },
  bug: { label: 'Bug', color: '#eb459e', icon: Bug },
  feedback: { label: 'Feedback', color: '#5865f2', icon: MessageSquare },
  appeal: { label: 'Appeal', color: '#23a55a', icon: ShieldOff },
};

const STATUS_COLOR: Record<string, string> = {
  open: '#f0b232', reviewed: '#5865f2', resolved: '#23a55a', dismissed: '#52535a',
};

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true); setError(false);
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (type) p.set('type', type);
    p.set('limit', '300');
    fetch(`/api/admin/reports?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(true); }
        else { setReports(d.reports ?? []); setCounts(d.counts ?? {}); }
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [status, type]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (id: number, body: { status?: string; promote?: boolean }) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) fetchData();
    } finally {
      setBusy(null);
    }
  };

  const STATUSES = ['open', 'reviewed', 'resolved', 'dismissed', ''];

  return (
    <div>
      {/* filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        {STATUSES.map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${status === s ? '#5865f2' : '#2e2e36'}`, background: status === s ? 'rgba(88,101,242,0.15)' : 'transparent', color: status === s ? '#7289da' : '#949ba4', textTransform: 'capitalize' }}>
            {s || 'all'}{s && counts[s] ? ` ${counts[s]}` : ''}
          </button>
        ))}
        <button onClick={fetchData} disabled={loading}
          style={{ marginLeft: 'auto', width: 34, height: 30, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <RefreshCw size={13} color="#6d6f78" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setType('')}
          style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${type === '' ? '#5865f2' : '#2e2e36'}`, background: type === '' ? 'rgba(88,101,242,0.12)' : 'transparent', color: type === '' ? '#7289da' : '#949ba4' }}>
          All types
        </button>
        {(Object.keys(TYPE_META) as ReportType[]).map((t) => (
          <button key={t} onClick={() => setType(type === t ? '' : t)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${type === t ? TYPE_META[t].color : '#2e2e36'}`, background: type === t ? `${TYPE_META[t].color}1f` : 'transparent', color: type === t ? TYPE_META[t].color : '#949ba4' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: TYPE_META[t].color }} />
            {TYPE_META[t].label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '20px 24px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#f87171' }}>
          Bot API unreachable.
        </div>
      )}

      {!error && !loading && reports.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <MessageSquare size={30} color="#2e2e36" style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#949ba4' }}>No reports here</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reports.map((r) => {
          const m = TYPE_META[r.type] ?? TYPE_META.feedback;
          return (
            <div key={r.id} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}33`, padding: '2px 8px', borderRadius: 99 }}>
                  <m.icon size={11} /> {m.label}
                </span>
                {r.category && <span style={{ fontSize: 11, color: '#6d6f78' }}>{r.category}</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[r.status] ?? '#52535a', textTransform: 'capitalize' }}>{r.status}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#52535a' }}>{relTime(r.createdAt)}</span>
              </div>

              {r.url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#f2f3f5', wordBreak: 'break-all' }}>{r.url}</span>
                  <a href={`/check?`} onClick={(e) => e.preventDefault()} title={r.url}><ExternalLink size={12} color="#52535a" /></a>
                </div>
              )}
              {r.message && <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.5, marginBottom: 8 }}>{r.message}</p>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#52535a' }}>by {r.username ?? `…${r.userId.slice(-4)}`}{r.guildId ? ` · guild …${r.guildId.slice(-4)}` : ''}</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button onClick={() => setOpenId(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(88,101,242,0.4)', background: 'rgba(88,101,242,0.1)', color: '#7289da' }}>
                    <MessageSquare size={13} /> Reply
                  </button>
                  {r.type === 'malicious_link' && (
                    <button onClick={() => act(r.id, { status: 'resolved', promote: true })} disabled={busy === r.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(242,63,67,0.4)', background: 'rgba(242,63,67,0.1)', color: '#f87171' }}>
                      <ShieldPlus size={13} /> Add to threat DB
                    </button>
                  )}
                  <button onClick={() => act(r.id, { status: 'resolved' })} disabled={busy === r.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(35,165,90,0.4)', background: 'rgba(35,165,90,0.1)', color: '#23a55a' }}>
                    <Check size={13} /> Resolve
                  </button>
                  <button onClick={() => act(r.id, { status: 'dismissed' })} disabled={busy === r.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid #2e2e36', background: '#18181b', color: '#949ba4' }}>
                    <Archive size={13} /> Dismiss
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {openId !== null && (
        <ReportThread reportId={openId} viewerIsAdmin
          onClose={() => setOpenId(null)} onChanged={fetchData} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
