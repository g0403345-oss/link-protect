'use client';

import { useCallback, useEffect, useState } from 'react';
import { Code2, Check, X, RefreshCw, Clock, CheckCircle2, XCircle, Undo2 } from 'lucide-react';
import type { DevRequestEntry } from '@/lib/db';

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: '#f0b232', icon: Clock },
  approved: { label: 'Approved', color: '#23a55a', icon: CheckCircle2 },
  denied: { label: 'Denied', color: '#f23f43', icon: XCircle },
};

function relTime(ts: number) {
  if (!ts) return '';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function AdminDevRequests() {
  const [requests, setRequests] = useState<DevRequestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dev-requests');
      if (res.ok) {
        const d = await res.json();
        setRequests(d.requests ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const decide = useCallback(async (userId: string, accept: boolean) => {
    setBusy(userId);
    try {
      const res = await fetch(`/api/admin/dev-requests/${userId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.userId === userId
          ? { ...r, status: accept ? 'approved' : 'denied', decidedAt: Math.floor(Date.now() / 1000) }
          : r));
      }
    } catch { /* ignore */ }
    finally { setBusy(null); }
  }, []);

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  const row = (r: DevRequestEntry) => {
    const meta = STATUS_META[r.status] ?? STATUS_META.pending;
    return (
      <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10 }}>
        {r.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#6d6f78', flexShrink: 0 }}>
            {(r.username ?? r.userId).slice(0, 2).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5' }}>{r.username ?? `User …${r.userId.slice(-4)}`}</span>
            <span style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace' }}>{r.userId}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}30`, padding: '2px 8px', borderRadius: 99 }}>
              <meta.icon size={10} /> {meta.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#6d6f78', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.message ?? <span style={{ color: '#52535a', fontStyle: 'italic' }}>no message</span>}
            <span style={{ color: '#52535a' }}> · requested {relTime(r.requestedAt)}{r.decidedAt ? ` · decided ${relTime(r.decidedAt)}` : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {r.status === 'pending' ? (
            <>
              <button onClick={() => decide(r.userId, true)} disabled={busy !== null}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 12, fontWeight: 700, background: '#23a55a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: busy && busy !== r.userId ? 0.5 : 1 }}>
                {busy === r.userId ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Approve
              </button>
              <button onClick={() => decide(r.userId, false)} disabled={busy !== null}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 12, fontWeight: 700, background: 'rgba(242,63,67,0.12)', color: '#f23f43', border: '1px solid rgba(242,63,67,0.3)', borderRadius: 8, cursor: 'pointer', opacity: busy && busy !== r.userId ? 0.5 : 1 }}>
                <X size={12} /> Deny
              </button>
            </>
          ) : r.status === 'approved' ? (
            <button onClick={() => decide(r.userId, false)} disabled={busy !== null} title="Revoke developer access"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#18181b', color: '#949ba4', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
              <Undo2 size={12} /> Revoke
            </button>
          ) : (
            <button onClick={() => decide(r.userId, true)} disabled={busy !== null} title="Approve after all"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#18181b', color: '#949ba4', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
              <Check size={12} /> Approve
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Code2 size={16} color="#5865f2" />
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em' }}>Developer Requests</h2>
          </div>
          <p style={{ fontSize: 13, color: '#52535a' }}>Approve or deny developer access — the user is notified either way</p>
        </div>
        <button onClick={fetchRequests} style={{ padding: '7px 10px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer' }}>
          <RefreshCw size={13} color="#6d6f78" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {loading && requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #5865f2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        </div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10 }}>
          <Code2 size={28} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#52535a' }}>No developer requests yet</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#f0b232', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending ({pending.length})</span>
              {pending.map(row)}
            </div>
          )}
          {decided.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Decided ({decided.length})</span>
              {decided.map(row)}
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
