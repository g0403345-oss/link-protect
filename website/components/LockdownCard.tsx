'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Siren, RefreshCw, Unlock, ShieldAlert } from 'lucide-react';
import type { LockdownStatus } from '@/lib/db';

function since(ts: number) {
  const m = Math.max(1, Math.floor((Date.now() / 1000 - ts) / 60));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Emergency lockdown — a compact control in the dashboard's breadcrumb bar.
 *  Idle: a quiet siren button. Active: a pulsing red pill. Clicking opens a
 *  small panel with the reason field + confirm (or the lift button). */
export default function LockdownControl({ guildId, onToast }: {
  guildId: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}) {
  const [status, setStatus] = useState<LockdownStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch(`/api/guild/${guildId}/lockdown`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setStatus(d as LockdownStatus); })
      .catch(() => {});
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirming(false); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = async (active: boolean) => {
    if (active && !confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/lockdown`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, reason: reason.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { onToast('error', d.error ?? 'Lockdown failed'); return; }
      setStatus(d as LockdownStatus);
      setReason('');
      setOpen(false);
      if (active) {
        const s = d.steps ?? {};
        onToast('success', `Lockdown active — slowmode on ${s.slowmode ?? 0} channels${s.invites ? ', invites paused' : ''}`);
      } else {
        onToast('success', 'Lockdown lifted — everything restored');
      }
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setBusy(false); }
  };

  const active = !!status?.active;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} title={active ? 'Lockdown is active' : 'Emergency lockdown'}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s',
          color: active ? '#fff' : '#f23f43',
          background: active ? '#f23f43' : 'rgba(242,63,67,0.08)',
          border: `1px solid ${active ? '#f23f43' : 'rgba(242,63,67,0.35)'}`,
          animation: active ? 'lpSirenGlow 1.4s ease-in-out infinite' : 'none' }}>
        <Siren size={13} />
        <span className="crumb-btn-label">{active ? 'Lockdown active' : 'Lockdown'}</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320, maxWidth: 'calc(100vw - 24px)', background: '#111113', border: `1px solid ${active ? 'rgba(242,63,67,0.45)' : '#2e2e36'}`, borderRadius: 12, padding: 16, zIndex: 300, boxShadow: '0 20px 48px rgba(0,0,0,0.55)' }}>
          {active ? (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#f23f43', marginBottom: 4 }}>
                Server frozen {status?.since ? `for ${since(status.since)}` : ''}{status?.by ? ` · by ${status.by}` : ''}
              </p>
              <p style={{ fontSize: 12, color: '#949ba4', lineHeight: 1.55, marginBottom: 12 }}>
                Slowmode on {status?.channelsLimited ?? 0} channels, invites paused, all links blocked.
                {status?.reason ? <> Reason: <b style={{ color: '#f2f3f5' }}>{status.reason}</b></> : null}
              </p>
              <button onClick={() => toggle(false)} disabled={busy}
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, background: '#23a55a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Unlock size={14} />}
                {busy ? 'Restoring…' : 'Lift lockdown'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: '#6d6f78', lineHeight: 1.55, marginBottom: 10 }}>
                Freezes the whole server: 30s slowmode everywhere, invites paused, all links blocked.
                Lifting it restores everything. Also: <code style={{ fontFamily: 'monospace', color: '#949ba4' }}>/lockdown</code>
              </p>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                placeholder="Reason (optional)"
                style={{ width: '100%', padding: '9px 11px', fontSize: 12.5, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit', marginBottom: 10 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#f23f43')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
              <button onClick={() => toggle(true)} disabled={busy}
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 13, fontWeight: 800, background: confirming ? '#f23f43' : 'rgba(242,63,67,0.12)', color: confirming ? '#fff' : '#f23f43', border: `1px solid ${confirming ? '#f23f43' : 'rgba(242,63,67,0.4)'}`, borderRadius: 8, cursor: 'pointer', opacity: busy ? 0.6 : 1, transition: 'all 0.15s' }}>
                {busy ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldAlert size={14} />}
                {busy ? 'Freezing server…' : confirming ? 'Really freeze the server?' : 'Activate lockdown'}
              </button>
              {busy && (
                <p style={{ fontSize: 11, color: '#52535a', marginTop: 8 }}>
                  Applying slowmode channel by channel — up to a minute on large servers.
                </p>
              )}
            </>
          )}
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes lpSirenGlow { 0%,100% { box-shadow: 0 0 0 rgba(242,63,67,0.0); } 50% { box-shadow: 0 0 14px rgba(242,63,67,0.7); } }
      `}</style>
    </div>
  );
}
