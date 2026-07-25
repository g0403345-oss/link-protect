'use client';

/**
 * Orange alert banner at the top of a guild dashboard: the bot tried to
 * kick/ban/timeout someone (Scam Shield, Raid Shield, warn escalation) and
 * Discord refused — missing permission or role rank. Without this the failed
 * action is invisible to admins unless they read the Discord log channel.
 *
 * Self-contained like LockdownControl: fetches its own data, renders nothing
 * while loading or when every failure is older than the last dismiss.
 */

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

interface PermFailure {
  feature: string;
  action: string;
  userId: string;
  username: string;
  reasons: string[];
  ts: number;
}

const VERB: Record<string, string> = { ban: 'ban', kick: 'kick', timeout: 'time out' };

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function PermFailBanner({ guildId }: { guildId: string }) {
  const [items, setItems] = useState<PermFailure[]>([]);
  const [dismissedAt, setDismissedAt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/guild/${guildId}/permfails`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setItems(Array.isArray(d.items) ? d.items : []);
        setDismissedAt(d.dismissedAt || 0);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [guildId]);

  const dismiss = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/permfails`, { method: 'POST' });
      const d = res.ok ? await res.json() : null;
      setDismissedAt(d?.dismissedAt || Math.floor(Date.now() / 1000));
    } catch {
      setDismissedAt(Math.floor(Date.now() / 1000)); // hide locally either way
    } finally {
      setBusy(false);
    }
  }, [guildId]);

  // Fresh failures only, newest first, one row per feature+action+user.
  const fresh = items
    .filter((i) => i.ts > dismissedAt)
    .sort((a, b) => b.ts - a.ts)
    .filter((i, idx, arr) => arr.findIndex((o) =>
      o.feature === i.feature && o.action === i.action && o.userId === i.userId) === idx)
    .slice(0, 3);

  if (!fresh.length) return null;

  return (
    <div role="alert" style={{
      marginBottom: 20, padding: '14px 16px', borderRadius: 12,
      background: 'rgba(240,178,50,0.07)', border: '1px solid rgba(240,178,50,0.35)',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <ShieldAlert size={18} color="#f0b232" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f0b232' }}>
          Link Protect is missing permissions
        </div>
        <div style={{ fontSize: 12.5, color: '#b5bac1', marginTop: 3, lineHeight: 1.5 }}>
          The bot tried to act but Discord refused — these protections did <b>not</b> go through:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {fresh.map((f) => (
            <div key={`${f.feature}-${f.action}-${f.userId}-${f.ts}`} style={{
              padding: '8px 10px', borderRadius: 8, background: 'rgba(240,178,50,0.06)',
              fontSize: 12.5, color: '#dbdee1', lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 700 }}>{f.feature}</span>
              {' couldn’t '}{VERB[f.action] ?? f.action}{' '}
              <span style={{ fontWeight: 600 }}>@{f.username}</span>
              <span style={{ color: '#6d6f78' }}> · {timeAgo(f.ts)}</span>
              {f.reasons?.length ? (
                <div style={{ color: '#949ba4', marginTop: 2 }}>{f.reasons.join(' ')}</div>
              ) : null}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#949ba4', marginTop: 10 }}>
          Fix: <b>Server Settings → Roles</b> — give <b>Link Protect</b> the permission and drag its
          role above your members&apos; roles. It then works automatically, no re-setup needed.
        </div>
      </div>
      <button onClick={dismiss} disabled={busy} title="Dismiss until it happens again" style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
        fontSize: 12, fontWeight: 600, color: '#949ba4', background: 'transparent',
        border: '1px solid #2e2e36', borderRadius: 7, cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1, transition: 'color 0.15s, border-color 0.15s',
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; (e.currentTarget as HTMLElement).style.borderColor = '#f0b232'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#949ba4'; (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; }}>
        <X size={13} /> Dismiss
      </button>
    </div>
  );
}
