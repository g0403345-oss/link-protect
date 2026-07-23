'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Trophy, ArrowRight } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/db';
import { SupporterBadge, StreakChip, rankMeta, VOTE_URL } from './SupporterBadge';

function monthName(key: string) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleString('en-US', { month: 'long' });
}

function Avatar({ entry, size, ring }: { entry: LeaderboardEntry; size: number; ring?: string }) {
  const initial = (entry.username ?? entry.id).slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: ring ? `0 0 0 3px ${ring}, 0 4px 14px rgba(0,0,0,0.4)` : undefined }}>
      {entry.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: size * 0.36, fontWeight: 800, color: '#6d6f78' }}>{initial}</span>
      )}
    </div>
  );
}

function PodiumCard({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const meta = rankMeta(entry.rank)!;
  const isGold = entry.rank === 1;
  return (
    <div
      className={isGold ? 'lp-gold-anim' : undefined}
      style={{
        flex: 1, maxWidth: 200, transform: isGold ? 'translateY(-12px)' : 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: isGold ? '20px 14px 18px' : '16px 12px',
        borderRadius: 16,
        background: isGold ? undefined : `linear-gradient(180deg, ${meta.color}12, transparent)`,
        border: `1px solid ${meta.color}${isGold ? '' : '40'}`,
      }}
    >
      <div style={{ fontSize: isGold ? 30 : 24, lineHeight: 1 }}>{meta.medal}</div>
      <Avatar entry={entry} size={isGold ? 68 : 52} ring={meta.glow} />
      <div style={{ fontSize: isGold ? 15 : 13.5, fontWeight: 700, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center' }}>
        {entry.username ?? `User …${entry.id.slice(-4)}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <SupporterBadge total={entry.total} />
        <StreakChip streak={entry.streak} />
        {isMe && <YouChip />}
      </div>
      <div style={{ marginTop: 2, fontSize: 20, fontWeight: 900, color: meta.color, letterSpacing: '-0.02em' }}>
        {entry.votes}
        <span style={{ fontSize: 11, fontWeight: 600, color: '#949ba4', marginLeft: 4 }}>{entry.votes === 1 ? 'vote' : 'votes'}</span>
      </div>
    </div>
  );
}

function YouChip() {
  return (
    <span style={{ flexShrink: 0, padding: '1px 6px', borderRadius: 6, background: 'rgba(240,178,50,0.14)', border: '1px solid rgba(240,178,50,0.4)', fontSize: 9.5, fontWeight: 800, color: '#f0b232', letterSpacing: '0.05em', lineHeight: 1.5 }}>
      YOU
    </span>
  );
}

export default function Leaderboard() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [data, setData] = useState<{ month: string; leaderboard: LeaderboardEntry[] } | null>(null);

  const load = useCallback(() => {
    fetch('/api/leaderboard?limit=10')
      .then((r) => r.json())
      .then(setData)
      // Keep the last good board on a failed refresh instead of blanking it.
      .catch(() => setData((prev) => prev ?? { month: '', leaderboard: [] }));
  }, []);

  // Poll while the tab is visible (and refresh on focus) so a new vote climbs
  // the board without the visitor having to reload the page.
  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(onVisible, 20_000);
    return () => {
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poll);
    };
  }, [load]);

  const board = data?.leaderboard ?? [];
  const top3 = board.slice(0, 3);
  const rest = board.slice(3);
  const podium = [top3[1], top3[0], top3[2]].filter(Boolean) as LeaderboardEntry[];
  // The free-spot CTA targets visitors who aren't on the board yet.
  const onBoard = !!myId && board.some((e) => e.id === myId);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', borderRadius: 22, overflow: 'hidden', border: '1px solid #26262c', background: '#0d0d10', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
      {/* ── Header ── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #1c1c21', background: 'radial-gradient(120% 100% at 50% 0%, rgba(240,178,50,0.08) 0%, rgba(13,13,16,0) 60%)' }}>
        <div style={{ padding: '40px 28px 28px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#f0b232', background: 'rgba(240,178,50,0.12)', border: '1px solid rgba(240,178,50,0.3)', borderRadius: 99, padding: '4px 12px', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Trophy size={12} /> Top Supporters{data?.month ? ` · ${monthName(data.month)}` : ''}
          </div>
          <h2 className="cta-title" style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 12, lineHeight: 1.05 }}>
            Vote &amp; get on the board
          </h2>
          <p style={{ fontSize: 15.5, color: '#6d6f78', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            {/* {' '} spacers are load-bearing — the JSX build eats plain spaces around these tags */}
            Vote for Link Protect on top.gg to earn a <strong style={{ color: '#ff6b6e' }}>♥ Supporter</strong>{' '}
            badge and role, build a <strong style={{ color: '#ff922b' }}>🔥 daily streak</strong>{' '}
            and climb the milestone tiers — Bronze, Silver, Gold &amp; Diamond.
          </p>
          <a href={VOTE_URL} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 22, padding: '12px 24px', fontSize: 14.5, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none', boxShadow: '0 8px 24px rgba(88,101,242,0.4)' }}>
            Vote on top.gg <ArrowRight size={15} />
          </a>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '28px 24px 26px' }}>
        {board.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
            <div style={{ fontSize: 34, marginBottom: 6 }}>🥇</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5', marginBottom: 4 }}>No votes yet this month</p>
            <p style={{ fontSize: 13.5, color: '#6d6f78' }}>Be the very first — vote above and claim the top spot.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 14, marginTop: 12, marginBottom: 22 }}>
              {podium.map((e) => <PodiumCard key={e.id} entry={e} isMe={e.id === myId} />)}
            </div>

            {(rest.length > 0 || !onBoard) && (
            <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, overflow: 'hidden' }}>
              {rest.map((e, i) => {
                const isMe = e.id === myId;
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < rest.length - 1 || !onBoard ? '1px solid #18181b' : 'none', background: isMe ? 'rgba(240,178,50,0.06)' : 'transparent', boxShadow: isMe ? 'inset 2px 0 0 #f0b232' : 'none' }}>
                    <span style={{ width: 22, fontSize: 13, fontWeight: 800, color: isMe ? '#f0b232' : '#52535a', textAlign: 'center' }}>{e.rank}</span>
                    <Avatar entry={e} size={32} />
                    <span style={{ minWidth: 0, fontSize: 14, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.username ?? `User …${e.id.slice(-4)}`}
                    </span>
                    {isMe && <YouChip />}
                    <span style={{ flex: 1 }} />
                    <SupporterBadge total={e.total} />
                    <StreakChip streak={e.streak} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#b5bac1', minWidth: 56, textAlign: 'right' }}>
                      {e.votes} {e.votes === 1 ? 'vote' : 'votes'}
                    </span>
                  </div>
                );
              })}
              {/* Next free spot — a small nudge that the board is claimable. */}
              {!onBoard && (
              <a href={VOTE_URL} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', textDecoration: 'none', background: 'rgba(88,101,242,0.04)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(88,101,242,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(88,101,242,0.04)')}>
                <span style={{ width: 22, fontSize: 13, fontWeight: 800, color: '#5865f2', textAlign: 'center' }}>{board.length + 1}</span>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px dashed #3d3f52', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5865f2', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>?</div>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#949ba4' }}>
                  This spot is free — one vote claims it
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#5865f2', whiteSpace: 'nowrap' }}>
                  Vote now <ArrowRight size={13} />
                </span>
              </a>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
