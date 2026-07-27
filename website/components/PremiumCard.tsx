'use client';

/**
 * Link Protect Premium — upgrade card on the guild Overview. Self-contained:
 * fetches the premium status itself; Stripe Checkout / customer portal via
 * the /api/stripe/* routes. Payment state lives in the bot DB (webhook-fed).
 */

import { useEffect, useState } from 'react';
import { Gem, ArrowRight, Settings2 } from 'lucide-react';

const PERKS = [
  'Custom embed color for every bot message',
  'Message templates up to 1,500 characters',
  'White-label verify page (no “Protected by” line)',
  '10× API rate limit · 20 keys · 10 webhooks',
  '💎 badge — and more perks every release, locked to this price',
];

export default function PremiumCard({ guildId, onToast }: {
  guildId: string;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const [status, setStatus] = useState<{ active: boolean; until?: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [interval, setInterval_] = useState<'month' | 'year'>('month');

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(88,101,242,0.1), rgba(235,69,158,0.06))', border: '1px solid rgba(88,101,242,0.35)' }}>
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
    );
  }

  return (
    <div style={{ position: 'relative', borderRadius: 14, padding: '18px 20px', background: 'linear-gradient(135deg, rgba(88,101,242,0.09), rgba(235,69,158,0.05))', border: '1px solid rgba(88,101,242,0.3)', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(88,101,242,0.18), transparent 70%)' }} />
      <div style={{ position: 'relative', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Gem size={16} color="#96a4ff" />
            <span style={{ fontSize: 14.5, fontWeight: 800, color: '#f2f3f5' }}>Link Protect Premium</span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {PERKS.map((p) => (
              <li key={p} style={{ fontSize: 12.5, color: '#b5bac1' }}>· {p}</li>
            ))}
          </ul>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          <div style={{ display: 'inline-flex', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: 3, gap: 2, alignSelf: 'center' }}>
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
          <span style={{ fontSize: 10.5, color: '#52535a', textAlign: 'center' }}>Cancel anytime · via Stripe</span>
        </div>
      </div>
    </div>
  );
}
