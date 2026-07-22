'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ArrowRight, Heart } from 'lucide-react';
import { VOTE_URL } from './SupporterBadge';

// One-time vote pitch shown on the server dashboard. Honest perks only — all
// four exist for real (badge+role, streaks, milestone tiers, supporter wall).
// "Don't show again" persists per Discord account via /api/me/flags; the X
// just snoozes it for a few days (localStorage).
const SNOOZE_KEY = 'lp_votepromo_snooze';
const SNOOZE_DAYS = 3;

const PERKS: { icon: string; title: string; text: string }[] = [
  {
    icon: '♥',
    title: 'Supporter badge & Discord role',
    text: 'The ♥ Supporter badge across the site plus the Supporter role on our support server — 30 days per vote.',
  },
  {
    icon: '🔥',
    title: 'Build a daily streak',
    text: 'Vote every day to grow a 🔥 streak shown next to your name on the leaderboard.',
  },
  {
    icon: '🏅',
    title: 'Milestone badges',
    text: '10 / 50 / 100 / 500 lifetime votes upgrade your badge: Bronze → Silver → Gold → Diamond.',
  },
  {
    icon: '🖼️',
    title: 'Get on the Supporter Wall',
    text: 'Every voter’s avatar is featured on the homepage wall for the whole month.',
  },
];

export default function VotePromo({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false); // drives the fade/slide-in
  const dismissed = useRef(false);               // never reopen once closed this visit

  useEffect(() => {
    if (!active || open || dismissed.current) return;
    // Snoozed recently? (X button — local, per browser)
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (until > Date.now()) return;
    } catch { /* ignore */ }
    let cancelled = false;
    // Don't pitch people who are already active supporters — the VoteBanner
    // handles their reminders. Target: never-voted / lapsed users.
    fetch('/api/me/vote')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || d.error || d.supporter) return;
        setTimeout(() => { if (!cancelled) { setOpen(true); requestAnimationFrame(() => setVisible(true)); } }, 1200);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active, open]);

  if (!open) return null;

  const close = () => {
    dismissed.current = true;
    setVisible(false);
    setTimeout(() => setOpen(false), 180);
  };

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400_000)); } catch { /* ignore */ }
    close();
  };

  const dismissForever = () => {
    fetch('/api/me/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ votePromptSeen: true }),
    }).catch(() => {});
    close();
  };

  return (
    <div
      onClick={snooze}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: 'rgba(8,8,10,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        opacity: visible ? 1 : 0, transition: 'opacity 0.18s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, borderRadius: 18, overflow: 'hidden',
          background: '#131316', border: '1px solid #2e2e36', boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.98)',
          transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Header */}
        <div style={{ position: 'relative', padding: '26px 26px 18px', background: 'radial-gradient(120% 120% at 50% 0%, rgba(242,63,67,0.12) 0%, rgba(19,19,22,0) 65%)', borderBottom: '1px solid #1e1e22' }}>
          <button onClick={snooze} title="Maybe later"
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#6d6f78', padding: 6, borderRadius: 8, display: 'flex' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f2f3f5')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6d6f78')}>
            <X size={16} />
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: 'rgba(242,63,67,0.14)', border: '1px solid rgba(242,63,67,0.35)', marginBottom: 12 }}>
            <Heart size={20} fill="#f23f43" color="#f23f43" />
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.02em', marginBottom: 5 }}>
            Enjoying Link Protect?
          </h3>
          <p style={{ fontSize: 13.5, color: '#949ba4', lineHeight: 1.55 }}>
            Voting on top.gg is free, takes ~10 seconds and unlocks real perks — every 12 hours.
          </p>
        </div>

        {/* Perks */}
        <div style={{ padding: '16px 26px 6px' }}>
          {PERKS.map((p) => (
            <div key={p.title} style={{ display: 'flex', gap: 12, padding: '9px 0', alignItems: 'flex-start' }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: '#1c1c21', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                {p.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5' }}>{p.title}</div>
                <div style={{ fontSize: 12.5, color: '#8b8f98', lineHeight: 1.5, marginTop: 1 }}>{p.text}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 26px 22px' }}>
          <a href={VOTE_URL} target="_blank" rel="noreferrer" onClick={dismissForever}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 0', fontSize: 14.5, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none', boxShadow: '0 8px 24px rgba(88,101,242,0.35)' }}>
            Vote on top.gg <ArrowRight size={15} />
          </a>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <button onClick={dismissForever}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#6d6f78', padding: '4px 8px' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#b5bac1')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6d6f78')}>
              Don&apos;t show again
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11.5, color: '#52535a', marginTop: 8 }}>
            Link Protect is 100% free — votes are what keep it growing. ♥
          </p>
        </div>
      </div>
    </div>
  );
}
