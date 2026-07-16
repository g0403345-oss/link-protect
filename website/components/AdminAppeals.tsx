'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, MessageSquare, Check, X, ShieldAlert, Scale } from 'lucide-react';
import type { Report } from '@/lib/db';
import ReportThread from '@/components/ReportThread';

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

/** Scam Shield unban appeals: review the conversation, then accept (removes the
 *  network flag) or deny. Both outcomes are posted into the thread and notify
 *  the user's bell. */
export default function AdminAppeals() {
  const [appeals, setAppeals] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState('open');
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null); // "accept:5" | "deny:5"
  const [openId, setOpenId] = useState<number | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true); setError(false);
    const p = new URLSearchParams({ type: 'appeal', limit: '300' });
    if (status) p.set('status', status);
    fetch(`/api/admin/reports?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(true);
        else setAppeals(d.reports ?? []);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const decide = async (id: number, accept: boolean) => {
    const key = `${accept ? 'accept' : 'deny'}:${id}`;
    if (confirm !== key) {
      setConfirm(key);
      window.setTimeout(() => setConfirm((c) => (c === key ? null : c)), 3500);
      return;
    }
    setConfirm(null); setBusy(id);
    try {
      const res = await fetch(`/api/admin/appeals/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      });
      if (res.ok) fetchData();
    } finally { setBusy(null); }
  };

  const STATUSES = ['open', 'reviewed', 'resolved', 'dismissed', ''];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(35,165,90,0.06)', border: '1px solid rgba(35,165,90,0.15)', borderRadius: 8, marginBottom: 14 }}>
        <Scale size={13} color="#23a55a" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: '#6d6f78' }}>
          <b style={{ color: '#23a55a' }}>Accept</b> removes the account&apos;s network flag (join check no longer applies).{' '}
          <b style={{ color: '#f23f43' }}>Deny</b> keeps it — the user can file a new appeal with new information.
          Both post the outcome into the conversation and ring the user&apos;s bell.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, alignItems: 'center' }}>
        {STATUSES.map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${status === s ? '#5865f2' : '#2e2e36'}`, background: status === s ? 'rgba(88,101,242,0.15)' : 'transparent', color: status === s ? '#7289da' : '#949ba4', textTransform: 'capitalize' }}>
            {s || 'all'}
          </button>
        ))}
        <button onClick={fetchData} disabled={loading}
          style={{ marginLeft: 'auto', width: 34, height: 30, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <RefreshCw size={13} color="#6d6f78" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {error && (
        <div style={{ padding: '20px 24px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#f87171' }}>
          Bot API unreachable.
        </div>
      )}

      {!error && !loading && appeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <ShieldAlert size={30} color="#2e2e36" style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#949ba4' }}>No appeals here</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {appeals.map((a) => (
          <div key={a.id} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f2f3f5' }}>{a.username ?? `…${a.userId.slice(-4)}`}</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#52535a' }}>{a.userId}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[a.status] ?? '#52535a', textTransform: 'capitalize' }}>{a.status}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#52535a' }}>{relTime(a.createdAt)}</span>
            </div>
            {a.message && <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.5, marginBottom: 10 }}>{a.message}</p>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setOpenId(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(88,101,242,0.4)', background: 'rgba(88,101,242,0.1)', color: '#7289da' }}>
                <MessageSquare size={13} /> Conversation
              </button>
              {(a.status === 'open' || a.status === 'reviewed') && (
                <>
                  <button onClick={() => decide(a.id, true)} disabled={busy === a.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(35,165,90,0.5)', background: confirm === `accept:${a.id}` ? '#23a55a' : 'rgba(35,165,90,0.1)', color: confirm === `accept:${a.id}` ? '#fff' : '#23a55a', marginLeft: 'auto' }}>
                    <Check size={13} /> {confirm === `accept:${a.id}` ? 'Confirm — remove flag?' : 'Accept'}
                  </button>
                  <button onClick={() => decide(a.id, false)} disabled={busy === a.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(242,63,67,0.5)', background: confirm === `deny:${a.id}` ? '#f23f43' : 'rgba(242,63,67,0.1)', color: confirm === `deny:${a.id}` ? '#fff' : '#f87171' }}>
                    <X size={13} /> {confirm === `deny:${a.id}` ? 'Confirm — deny?' : 'Deny'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {openId !== null && (
        <ReportThread reportId={openId} viewerIsAdmin
          onClose={() => setOpenId(null)} onChanged={fetchData} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
