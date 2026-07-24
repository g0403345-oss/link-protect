'use client';

import { useCallback, useEffect, useState } from 'react';
import { Siren, RefreshCw, Unlock, ShieldAlert } from 'lucide-react';
import type { LockdownStatus } from '@/lib/db';

function since(ts: number) {
  const m = Math.max(1, Math.floor((Date.now() / 1000 - ts) / 60));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Emergency lockdown — the "fire extinguisher on the wall" for a live raid. */
export default function LockdownCard({ guildId, onToast }: {
  guildId: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}) {
  const [status, setStatus] = useState<LockdownStatus | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/guild/${guildId}/lockdown`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setStatus(d as LockdownStatus); })
      .catch(() => {});
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

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
    <div style={{ background: active ? 'rgba(242,63,67,0.06)' : '#111113', border: `1px solid ${active ? 'rgba(242,63,67,0.45)' : '#1e1e22'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.3s, background 0.3s' }}>
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${active ? 'rgba(242,63,67,0.25)' : '#1e1e22'}`, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Siren size={14} color="#f23f43" style={active ? { animation: 'lpSirenPulse 1.2s ease-in-out infinite' } : undefined} />
        <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#f23f43' : '#949ba4' }}>
          Emergency Lockdown{active ? ' — ACTIVE' : ''}
        </span>
      </div>
      <div style={{ padding: 18 }}>
        {active ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: '#f23f43', marginBottom: 4 }}>
                Server frozen {status?.since ? `for ${since(status.since)}` : ''}{status?.by ? ` · by ${status.by}` : ''}
              </p>
              <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>
                Slowmode on {status?.channelsLimited ?? 0} channels, invites paused, every link blocked.
                {status?.reason ? <> Reason: <b style={{ color: '#f2f3f5' }}>{status.reason}</b></> : null}
              </p>
            </div>
            <button onClick={() => toggle(false)} disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', fontSize: 13.5, fontWeight: 700, background: '#23a55a', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', opacity: busy ? 0.6 : 1, flexShrink: 0 }}>
              {busy ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Unlock size={14} />}
              {busy ? 'Restoring…' : 'Lift lockdown'}
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: '#6d6f78', lineHeight: 1.55, marginBottom: 12 }}>
              Raid in progress? One click freezes the whole server: 30s slowmode on every channel,
              invites paused, all links blocked. <b style={{ color: '#949ba4' }}>Lifting it restores everything exactly as it was</b> —
              also available as <code style={{ fontFamily: 'monospace', color: '#949ba4' }}>/lockdown</code> in Discord.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                placeholder="Reason (optional, shown in the log)"
                style={{ flex: 1, minWidth: 200, padding: '10px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#f23f43')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
              <button onClick={() => toggle(true)} disabled={busy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 13.5, fontWeight: 800, background: confirming ? '#f23f43' : 'rgba(242,63,67,0.12)', color: confirming ? '#fff' : '#f23f43', border: `1px solid ${confirming ? '#f23f43' : 'rgba(242,63,67,0.4)'}`, borderRadius: 9, cursor: 'pointer', opacity: busy ? 0.6 : 1, transition: 'all 0.15s', flexShrink: 0 }}>
                {busy ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldAlert size={14} />}
                {busy ? 'Freezing server…' : confirming ? 'Really freeze the server?' : 'Activate lockdown'}
              </button>
            </div>
            {busy && (
              <p style={{ fontSize: 11.5, color: '#52535a', marginTop: 10 }}>
                Applying slowmode channel by channel — this can take up to a minute on large servers.
              </p>
            )}
          </>
        )}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes lpSirenPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>
    </div>
  );
}
