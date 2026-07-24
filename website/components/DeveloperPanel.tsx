'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KeyRound, Webhook, Plus, Trash2, Copy, Check, RefreshCw, Send, Eye, EyeOff,
  Download, FlaskConical, BookOpen, ExternalLink, Image as ImageIcon, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import BadgeCard from '@/components/BadgeCard';
import CollapsibleCard, { cardKey } from '@/components/CollapsibleCard';
import type { DevKey, DevWebhook, DevStatus, WebhookEvent } from '@/lib/db';

const EVENT_META: Record<string, { label: string; desc: string }> = {
  link_blocked: { label: 'Link blocked', desc: 'A link was blocked and the member warned' },
  member_kicked: { label: 'Member kicked', desc: 'Warn threshold escalated to a kick' },
  member_banned: { label: 'Member banned', desc: 'Warn threshold escalated to a ban' },
  member_timeout: { label: 'Member timeout', desc: 'Warn threshold escalated to a timeout' },
  scamshield_catch: { label: 'Scam Shield catch', desc: 'Cross-channel scam spam was caught' },
  raid_detected: { label: 'Raid detected', desc: 'A link raid was auto-defended' },
};

function relTime(ts: number) {
  if (!ts) return 'never';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof KeyRound; children: React.ReactNode }) {
  return (
    <CollapsibleCard storageKey={cardKey('dev', title)}
      title={<><Icon size={14} color="#5865f2" /> {title}</>}>
      {children}
    </CollapsibleCard>
  );
}

function CopyBtn({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: small ? '5px 9px' : '7px 11px', fontSize: 11, fontWeight: 600, color: copied ? '#23a55a' : '#949ba4', background: '#18181b', border: `1px solid ${copied ? 'rgba(35,165,90,0.4)' : '#2e2e36'}`, borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function DeveloperPanel({ guildId, onToast }: {
  guildId: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}) {
  /* ── API keys ── */
  const [keys, setKeys] = useState<DevKey[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<DevKey | null>(null); // shown once

  /* ── Webhooks ── */
  const [hooks, setHooks] = useState<DevWebhook[]>([]);
  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState<WebhookEvent[]>(['link_blocked']);
  const [whCreating, setWhCreating] = useState(false);
  const [whBusy, setWhBusy] = useState<number | null>(null);
  const [secretShown, setSecretShown] = useState<number | null>(null);

  /* ── Early access ── */
  const [dev, setDev] = useState<DevStatus | null>(null);
  const [betaSaving, setBetaSaving] = useState(false);

  const [exporting, setExporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [k, w, d] = await Promise.all([
        fetch(`/api/guild/${guildId}/dev/keys`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/guild/${guildId}/dev/webhooks`).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/me/dev').then((r) => (r.ok ? r.json() : null)),
      ]);
      if (k) setKeys(k.keys ?? []);
      if (w) setHooks(w.webhooks ?? []);
      if (d && !d.error) setDev(d as DevStatus);
    } catch { /* ignore */ }
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/dev/keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { onToast('error', d.error ?? 'Could not create key'); return; }
      setFreshKey(d as DevKey);
      setNewLabel('');
      setKeys((prev) => [{ ...(d as DevKey), key: undefined }, ...prev]);
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setCreating(false); }
  };

  const revokeKey = async (id: number) => {
    try {
      const res = await fetch(`/api/guild/${guildId}/dev/keys/${id}`, { method: 'DELETE' });
      if (res.ok) { setKeys((prev) => prev.filter((k) => k.id !== id)); onToast('success', 'Key revoked'); }
      else onToast('error', 'Revoke failed');
    } catch { onToast('error', 'Could not reach the server'); }
  };

  const createHook = async () => {
    setWhCreating(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/dev/webhooks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: whUrl.trim(), events: whEvents }),
      });
      const d = await res.json();
      if (!res.ok) { onToast('error', d.error ?? 'Could not create webhook'); return; }
      setHooks((prev) => [d as DevWebhook, ...prev]);
      setWhUrl(''); setWhEvents(['link_blocked']);
      onToast('success', 'Webhook created');
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setWhCreating(false); }
  };

  const patchHook = async (id: number, body: { enabled?: boolean; events?: WebhookEvent[] }) => {
    setWhBusy(id);
    try {
      const res = await fetch(`/api/guild/${guildId}/dev/webhooks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) setHooks((prev) => prev.map((h) => (h.id === id ? (d as DevWebhook) : h)));
      else onToast('error', d.error ?? 'Update failed');
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setWhBusy(null); }
  };

  const deleteHook = async (id: number) => {
    setWhBusy(id);
    try {
      const res = await fetch(`/api/guild/${guildId}/dev/webhooks/${id}`, { method: 'DELETE' });
      if (res.ok) { setHooks((prev) => prev.filter((h) => h.id !== id)); onToast('success', 'Webhook deleted'); }
      else onToast('error', 'Delete failed');
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setWhBusy(null); }
  };

  const testHook = async (id: number) => {
    setWhBusy(id);
    try {
      const res = await fetch(`/api/guild/${guildId}/dev/webhooks/${id}/test`, { method: 'POST' });
      const d = await res.json();
      if (d.ok) onToast('success', `Test delivered — HTTP ${d.status}`);
      else onToast('error', `Test failed — ${d.status ? `HTTP ${d.status}` : 'endpoint unreachable'}`);
      load();
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setWhBusy(null); }
  };

  const toggleBeta = async (enabled: boolean) => {
    setBetaSaving(true);
    try {
      const res = await fetch('/api/me/dev/beta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const d = await res.json();
      if (res.ok) { setDev(d as DevStatus); onToast('success', enabled ? 'Early access on' : 'Early access off'); }
      else onToast('error', d.error ?? 'Failed to save');
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setBetaSaving(false); }
  };

  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportData = async (what: 'stats' | 'trends' | 'audit') => {
    setExporting(what);
    try {
      if (what === 'stats') {
        const d = await fetch(`/api/guild/${guildId}/stats`).then((r) => r.json());
        download(`linkprotect-stats-${guildId}.json`, JSON.stringify(d, null, 2), 'application/json');
      } else if (what === 'trends') {
        const d = await fetch(`/api/guild/${guildId}/trends?days=60`).then((r) => r.json());
        const rows = [['date', 'warned', 'kicked', 'banned', 'timeout', 'total']];
        for (const p of d.perDay ?? []) rows.push([p.date, p.warned, p.kicked, p.banned, p.timeout, p.count]);
        download(`linkprotect-trends-${guildId}.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv');
      } else {
        const d = await fetch(`/api/guild/${guildId}/audit`).then((r) => r.json());
        const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
        const rows = [['timestamp', 'user', 'description'].join(',')];
        for (const e of d.entries ?? []) rows.push([e.timestamp, q(e.username ?? e.userId), q(e.description)].join(','));
        download(`linkprotect-audit-${guildId}.csv`, rows.join('\n'), 'text/csv');
      }
      onToast('success', 'Export downloaded');
    } catch { onToast('error', 'Export failed'); }
    finally { setExporting(null); }
  };

  const statsEmbedUrl = `https://link-protect.com/api/embed/stats?guild=${guildId}`;
  const lbEmbedUrl = 'https://link-protect.com/api/embed/leaderboard?limit=5';
  const input = { padding: '9px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── API keys ── */}
      <Card title={`API Keys (${keys.length}/5)`} icon={KeyRound}>
        <p style={{ fontSize: 12.5, color: '#6d6f78', lineHeight: 1.55, marginBottom: 14 }}>
          Read-only access to this server&rsquo;s stats and trends plus the threat lookup —
          base URL <code style={{ color: '#949ba4', fontFamily: 'monospace' }}>https://link-protect.com/api/v1</code>,
          auth via <code style={{ color: '#949ba4', fontFamily: 'monospace' }}>X-Api-Key</code> header, 60 requests/min per key.
          {' '}<Link href="/developers" style={{ color: '#5865f2' }}>Read the docs →</Link>
        </p>

        {freshKey && (
          <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(35,165,90,0.07)', border: '1px solid rgba(35,165,90,0.3)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <AlertTriangle size={13} color="#f0b232" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f2f3f5' }}>Copy this key now — it won&rsquo;t be shown again</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontSize: 12, color: '#23a55a', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, padding: '8px 10px', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                {freshKey.key}
              </code>
              <CopyBtn text={freshKey.key ?? ''} />
              <button onClick={() => setFreshKey(null)} style={{ padding: '7px 11px', fontSize: 11, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: keys.length ? 14 : 0 }}>
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={60}
            placeholder="Label (e.g. website widget)" style={{ ...input, flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !creating && keys.length < 5) createKey(); }} />
          <button onClick={createKey} disabled={creating || keys.length >= 5}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: creating || keys.length >= 5 ? 0.5 : 1 }}>
            {creating ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />} Create key
          </button>
        </div>

        {keys.map((k) => (
          <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, marginBottom: 5 }}>
            <code style={{ fontSize: 12, color: '#949ba4', fontFamily: 'monospace', flexShrink: 0 }}>{k.prefix}…</code>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#f2f3f5', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {k.label ?? <span style={{ color: '#52535a', fontStyle: 'italic' }}>unnamed</span>}
            </span>
            <span style={{ fontSize: 11, color: '#52535a', flexShrink: 0 }}>
              {k.totalRequests.toLocaleString()} req · used {relTime(k.lastUsed)}
            </span>
            <button onClick={() => revokeKey(k.id)} title="Revoke key"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f23f43')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </Card>

      {/* ── Webhooks ── */}
      <Card title={`Webhooks (${hooks.length}/3)`} icon={Webhook}>
        <p style={{ fontSize: 12.5, color: '#6d6f78', lineHeight: 1.55, marginBottom: 14 }}>
          Get an HTTPS POST the moment something happens in this server. Every delivery is signed
          with an HMAC-SHA256 header (<code style={{ color: '#949ba4', fontFamily: 'monospace' }}>X-LinkProtect-Signature</code>)
          so you can verify it&rsquo;s really us. Auto-disabled after 25 consecutive failures.
        </p>

        <div style={{ marginBottom: hooks.length ? 16 : 0 }}>
          <input type="text" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} maxLength={500}
            placeholder="https://your-server.com/linkprotect-hook" style={{ ...input, width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {(Object.keys(EVENT_META) as WebhookEvent[]).map((ev) => {
              const on = whEvents.includes(ev);
              return (
                <button key={ev} title={EVENT_META[ev].desc}
                  onClick={() => setWhEvents((p) => (on ? p.filter((x) => x !== ev) : [...p, ev]))}
                  style={{ padding: '5px 11px', fontSize: 11.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', background: on ? 'rgba(88,101,242,0.15)' : '#18181b', color: on ? '#7289da' : '#6d6f78', border: `1px solid ${on ? 'rgba(88,101,242,0.4)' : '#2e2e36'}` }}>
                  {EVENT_META[ev].label}
                </button>
              );
            })}
          </div>
          <button onClick={createHook} disabled={whCreating || !whUrl.trim() || whEvents.length === 0 || hooks.length >= 3}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: whCreating || !whUrl.trim() || whEvents.length === 0 || hooks.length >= 3 ? 0.5 : 1 }}>
            {whCreating ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />} Add webhook
          </button>
        </div>

        {hooks.map((h) => (
          <div key={h.id} style={{ padding: '11px 13px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, marginBottom: 6, opacity: h.enabled ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: !h.enabled ? '#52535a' : h.lastStatus == null ? '#f0b232' : h.lastStatus >= 200 && h.lastStatus < 300 ? '#23a55a' : '#f23f43' }} />
              <code style={{ flex: 1, fontSize: 12, color: '#f2f3f5', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.url}</code>
              <button onClick={() => testHook(h.id)} disabled={whBusy !== null} title="Send a test event"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#949ba4', background: '#111113', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer' }}>
                {whBusy === h.id ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />} Test
              </button>
              <button onClick={() => patchHook(h.id, { enabled: !h.enabled })} disabled={whBusy !== null}
                style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, color: h.enabled ? '#f0b232' : '#23a55a', background: '#111113', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer' }}>
                {h.enabled ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => deleteHook(h.id)} disabled={whBusy !== null} title="Delete webhook"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#f23f43')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 7 }}>
              {h.events.map((ev) => (
                <span key={ev} style={{ padding: '2px 8px', fontSize: 10.5, fontWeight: 600, color: '#7289da', background: 'rgba(88,101,242,0.1)', borderRadius: 99 }}>
                  {EVENT_META[ev]?.label ?? ev}
                </span>
              ))}
              <span style={{ fontSize: 10.5, color: '#52535a', marginLeft: 'auto' }}>
                {h.lastStatus != null ? `last: HTTP ${h.lastStatus} · ${relTime(h.lastDeliveryAt)}` : 'no deliveries yet'}
                {h.failureCount > 0 ? ` · ${h.failureCount} failure${h.failureCount === 1 ? '' : 's'}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#52535a' }}>SECRET</span>
              <code style={{ flex: 1, fontSize: 11, color: '#949ba4', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {secretShown === h.id ? h.secret : '•'.repeat(28)}
              </code>
              <button onClick={() => setSecretShown(secretShown === h.id ? null : h.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 2 }}>
                {secretShown === h.id ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <CopyBtn text={h.secret} small />
            </div>
          </div>
        ))}
      </Card>

      {/* ── Badge (existing) ── */}
      <BadgeCard guildId={guildId} />

      {/* ── More embeds ── */}
      <Card title="Embeds" icon={ImageIcon}>
        <p style={{ fontSize: 12.5, color: '#6d6f78', lineHeight: 1.55, marginBottom: 14 }}>
          Live SVG widgets for your website or README — they update automatically.
          The badge above also supports <code style={{ color: '#949ba4', fontFamily: 'monospace' }}>&amp;style=light</code> for bright pages.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f2f3f5', marginBottom: 8 }}>Server stats card</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/embed/stats?guild=${guildId}`} alt="Live stats card" style={{ marginBottom: 8, maxWidth: '100%' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontSize: 11, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, padding: '7px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {statsEmbedUrl}
              </code>
              <CopyBtn text={statsEmbedUrl} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f2f3f5', marginBottom: 8 }}>Voter leaderboard</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/embed/leaderboard?limit=5" alt="Voter leaderboard" style={{ marginBottom: 8, maxWidth: '100%' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontSize: 11, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, padding: '7px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {lbEmbedUrl}
              </code>
              <CopyBtn text={lbEmbedUrl} />
            </div>
          </div>
        </div>
      </Card>

      {/* ── Data export ── */}
      <Card title="Data Export" icon={Download}>
        <p style={{ fontSize: 12.5, color: '#6d6f78', lineHeight: 1.55, marginBottom: 12 }}>
          Download this server&rsquo;s moderation data for your own analysis or backups.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {([
            { id: 'stats', label: 'Stats (JSON)' },
            { id: 'trends', label: 'Trends, 60 days (CSV)' },
            { id: 'audit', label: 'Audit log (CSV)' },
          ] as const).map((b) => (
            <button key={b.id} onClick={() => exportData(b.id)} disabled={exporting !== null}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', fontSize: 12.5, fontWeight: 600, color: '#f2f3f5', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', opacity: exporting && exporting !== b.id ? 0.5 : 1 }}>
              {exporting === b.id ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
              {b.label}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Early access ── */}
      <Card title="Early Access" icon={FlaskConical}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5', marginBottom: 3 }}>Beta programme</div>
            <p style={{ fontSize: 12.5, color: '#6d6f78', lineHeight: 1.55 }}>
              Get new Link Protect features on your account before everyone else — and help shape
              them with your feedback. Applies to all your servers.
            </p>
          </div>
          <button onClick={() => toggleBeta(!dev?.beta)} disabled={betaSaving || !dev}
            style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', background: dev?.beta ? '#23a55a' : '#2e2e36', transition: 'background 0.15s', opacity: betaSaving ? 0.6 : 1 }}>
            <span style={{ position: 'absolute', top: 3, left: dev?.beta ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
          </button>
        </div>
      </Card>

      {/* ── Docs ── */}
      <Link href="/developers" style={{ textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 10, cursor: 'pointer' }}>
          <BookOpen size={16} color="#5865f2" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5' }}>API documentation</div>
            <div style={{ fontSize: 12, color: '#6d6f78' }}>Endpoints, webhook signatures, embeds — everything in one place</div>
          </div>
          <ExternalLink size={14} color="#52535a" />
        </div>
      </Link>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
