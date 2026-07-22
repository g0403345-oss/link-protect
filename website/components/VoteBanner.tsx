'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { VoteStatus } from '@/lib/db';
import { SupporterBadge, StreakChip, milestoneMeta, rankMeta, VOTE_URL } from './SupporterBadge';

function fmt(sec: number) {
  if (sec <= 0) return 'now';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function VoteBanner() {
  const [v, setV] = useState<VoteStatus | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const load = useCallback(() => {
    fetch('/api/me/vote')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setV(d); })
      .catch(() => {});
  }, []);

  // Load once, then refresh when the user returns to the tab (e.g. after voting
  // on top.gg) so the banner reflects their new status without a reload.
  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(onVisible, 30_000);
    return () => {
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poll);
    };
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Show the remaining cooldown whenever the user is inside their 12h window.
  // Times are accurate: the top.gg webhook records the exact vote time, and the
  // /check fallback detects a vote within ~60s, so canVoteAt is reliable.
  const inCooldown = !!v && now < v.canVoteAt;
  const canVote = !inCooldown;
  const meta = rankMeta(v?.rank);
  const accent = meta?.color ?? '#5865f2';

  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 12,
        border: `1px solid ${meta ? meta.color : 'rgba(88,101,242,0.45)'}`,
        boxShadow: meta ? `0 0 16px ${meta.glow}` : undefined,
      }}
    >
      {/* top.gg cover backdrop — blurred fill (soft edges) */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/topgg-banner.webp)', backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(14px)', transform: 'scale(1.2)', opacity: 0.45 }} />
      {/* sharp image, masked to fade at the edges */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/topgg-banner.webp)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.8, WebkitMaskImage: 'radial-gradient(130% 170% at 50% 50%, #000 42%, transparent 94%)', maskImage: 'radial-gradient(130% 170% at 50% 50%, #000 42%, transparent 94%)' }} />
      {/* dark gradient for legibility */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(13,13,16,0.94) 0%, rgba(13,13,16,0.72) 55%, rgba(13,13,16,0.9) 100%)' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
        {meta ? (
          <div style={{ width: 38, height: 38, borderRadius: 9, background: `${accent}26`, border: `1px solid ${accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 20 }}>{meta.medal}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/topgg-logo.webp" alt="top.gg" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,0.12)' }} />
        )}

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: '#fff' }}>
              {v?.rank ? `You're #${v.rank} this month` : 'Vote for Link Protect'}
            </span>
            {v?.supporter && <SupporterBadge total={v.total} />}
            <StreakChip streak={v?.streak} />
          </div>
          <p style={{ fontSize: 12.5, color: '#c4c6cc', marginTop: 2 }}>
            {inCooldown
              ? (v!.streak >= 2
                  ? `Thanks for voting! 🎉 Your 🔥 ${v!.streak}-day streak is safe — come back in ${fmt(v!.canVoteAt - now)}.`
                  : `Thanks for voting! 🎉 You can vote again in ${fmt(v!.canVoteAt - now)}.`)
              : (v && v.streak >= 2
                  ? `🔥 Keep your ${v.streak}-day streak alive — vote now before it resets!`
                  : 'Your vote keeps Link Protect free — earn the ♥ Supporter badge, build a 🔥 streak and climb the milestone tiers.')}
            {(() => {
              const m = milestoneMeta(v?.total);
              if (v?.total && m?.next) return ` ${m.next - v.total} more votes to ${m.next === 50 ? 'Silver' : m.next === 100 ? 'Gold' : 'Diamond'}.`;
              if (v?.total && !m && v.total > 0) return ` ${10 - v.total} more ${10 - v.total === 1 ? 'vote' : 'votes'} to your Bronze badge.`;
              return '';
            })()}
          </p>
        </div>

        <a
          href={VOTE_URL} target="_blank" rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 13.5, fontWeight: 700,
            background: canVote ? '#5865f2' : 'rgba(24,24,27,0.8)', color: canVote ? '#fff' : '#c4c6cc',
            border: canVote ? 'none' : '1px solid #2e2e36', borderRadius: 9, textDecoration: 'none', whiteSpace: 'nowrap',
            boxShadow: canVote ? '0 6px 18px rgba(88,101,242,0.4)' : undefined,
          }}
        >
          {inCooldown ? `Vote in ${fmt(v!.canVoteAt - now)}` : <>Vote now <ArrowRight size={14} /></>}
        </a>
      </div>
    </div>
  );
}
