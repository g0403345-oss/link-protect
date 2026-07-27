'use client';

/**
 * Link Protect Premium — upgrade card on the guild Overview. Self-contained:
 * fetches the premium status itself; Stripe Checkout / customer portal via
 * the /api/stripe/* routes. Payment state lives in the bot DB (webhook-fed).
 */

import { useEffect, useState } from 'react';
import { Gem, ArrowRight, Settings2, ChevronDown, ShieldCheck } from 'lucide-react';

const PERK_GROUPS: { title: string; items: string[] }[] = [
  { title: 'Personalize', items: [
    'Embed color & custom footer',
    'Welcome & leave messages',
    'Templates up to 1,500 characters',
    'Verify page: your logo & rules gate',
    'Vanity link — /verify/your-server',
    'White-label (no Link Protect branding)',
  ]},
  { title: 'Moderate', items: [
    'Watchlist with instant alerts',
    'Night schedule & event mode',
    'One-click false-positive undo',
    'Sync settings to 25 servers',
  ]},
  { title: 'Develop', items: [
    '600 API requests/min (10×)',
    '20 API keys · 10 webhooks',
    'Priority for new features',
  ]},
];

export default function PremiumCard({ guildId, onToast, onNavigate }: {
  guildId: string;
  onToast: (type: 'success' | 'error', msg: string) => void;
  onNavigate?: (section: string) => void;
}) {
  const [status, setStatus] = useState<{ active: boolean; until?: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [interval, setInterval_] = useState<'month' | 'year'>('month');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/guild/${guildId}/premium`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setStatus(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [guildId]);

  const go = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error);
      window.location.href = d.url;
    } catch {
      onToast('error', 'Could not open Stripe — try again');
      setBusy(false);
    }
  };

  if (status === null) return null;

  if (status.active) {
    return (
      <div style={{ borderRadius: 12, background: 'linear-gradient(135deg, rgba(88,101,242,0.1), rgba(235,69,158,0.06))', border: '1px solid rgba(88,101,242,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
        <Gem size={17} color="#96a4ff" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, color: '#dbdee1' }}>
          <b style={{ color: '#f2f3f5' }}>Premium active</b>
          {status.until ? <span style={{ color: '#6d6f78' }}> · renews {new Date(status.until * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null}
          <span style={{ color: '#6d6f78' }}> — thank you for supporting Link Protect 💜</span>
        </span>
        <button onClick={() => go('/api/stripe/portal', { guildId })} disabled={busy} className="btn-secondary btn-sm" style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }}>
          <Settings2 size={13} /> Manage
        </button>
      </div>

      {/* Perk directory — no hunting for where the extras live */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 12px' }}>
        {[
          { label: 'Embed color & long templates', sec: 'messages' },
          { label: 'Verify logo & vanity link', sec: 'verification' },
          { label: 'Automation & event mode', sec: 'blockers' },
          { label: 'Watchlist', sec: 'warnings' },
          { label: 'False-positive undo', sec: 'log' },
        ].map((pk) => (
          <button key={pk.sec + pk.label} onClick={() => onNavigate?.(pk.sec)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, color: '#96a4ff', background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.22)', borderRadius: 99, cursor: 'pointer', transition: 'background 0.13s' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(88,101,242,0.16)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(88,101,242,0.08)')}>
            {pk.label} <ArrowRight size={10} />
          </button>
        ))}
        <span style={{ fontSize: 11.5, color: '#52535a', alignSelf: 'center' }}>· Sync lives on the server list</span>
      </div>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 12, border: '1px solid #1e1e22', background: '#111113', overflow: 'hidden' }}>
      {/* Quiet, collapsed by default — Premium is an offer, not a billboard. */}
      <button onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <Gem size={14} color="#96a4ff" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: '#949ba4', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <b style={{ color: '#dbdee1' }}>Premium</b> — personalize your server. <span style={{ color: '#52535a' }}>All protection stays free, always.</span>
        </span>
        <ChevronDown size={13} color="#52535a" style={{ marginLeft: 'auto', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1a1a1e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 2px', margin: '10px 0 12px' }}>
            <ShieldCheck size={14} color="#23a55a" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#949ba4', lineHeight: 1.5 }}>
              <b style={{ color: '#23a55a' }}>Every security feature is free — forever.</b>{' '}
              Premium is personalization and extras, never protection.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '4px 28px' }}>
            {PERK_GROUPS.map((g) => (
              <div key={g.title} style={{ paddingTop: 4 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#52535a', marginBottom: 8 }}>{g.title}</div>
                {g.items.map((it) => (
                  <div key={it} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3.5px 0' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5865f2', flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontSize: 12.5, color: '#b5bac1', lineHeight: 1.45 }}>{it}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: 3, gap: 2 }}>
              {(['month', 'year'] as const).map((iv) => (
                <button key={iv} onClick={() => setInterval_(iv)}
                  style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer', background: interval === iv ? 'rgba(88,101,242,0.25)' : 'transparent', color: interval === iv ? '#96a4ff' : '#6d6f78' }}>
                  {iv === 'month' ? '3,49 €/mo' : '29 €/yr'}
                </button>
              ))}
            </div>
            <button onClick={() => go('/api/stripe/checkout', { guildId, interval })} disabled={busy}
              className="btn-primary btn-sm" style={{ opacity: busy ? 0.6 : 1 }}>
              <Gem size={13} /> Upgrade this server <ArrowRight size={12} />
            </button>
            <span style={{ fontSize: 11, color: '#52535a' }}>Cancel anytime · via Stripe · per server</span>
          </div>
        </div>
      )}
    </div>
  );
}
