'use client';

import { Heart } from 'lucide-react';

export const VOTE_URL = 'https://top.gg/bot/888390889892892684/vote';

export interface RankMeta {
  color: string;
  glow: string;
  animated: boolean;
  medal: string;
  label: string;
}

/** Gold (#1, animated) / Silver (#2) / Bronze (#3) styling, or null otherwise. */
export function rankMeta(rank?: number | null): RankMeta | null {
  switch (rank) {
    case 1: return { color: '#FFD700', glow: 'rgba(255,215,0,0.45)', animated: true, medal: '🥇', label: 'Top voter' };
    case 2: return { color: '#C0C0C0', glow: 'rgba(192,192,192,0.35)', animated: false, medal: '🥈', label: '#2 voter' };
    case 3: return { color: '#CD7F32', glow: 'rgba(205,127,50,0.4)', animated: false, medal: '🥉', label: '#3 voter' };
    default: return null;
  }
}

// ── Lifetime-vote milestone tiers ────────────────────────────────────────────

export interface MilestoneMeta {
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
  color: string;
  bg: string;
  at: number;          // votes needed for this tier
  next: number | null; // votes needed for the next tier (null = maxed out)
}

const MILESTONES: MilestoneMeta[] = [
  { tier: 'Diamond', color: '#7fd8ff', bg: 'rgba(127,216,255,0.14)', at: 500, next: null },
  { tier: 'Gold',    color: '#FFD700', bg: 'rgba(255,215,0,0.13)',   at: 100, next: 500 },
  { tier: 'Silver',  color: '#C8CCD4', bg: 'rgba(200,204,212,0.13)', at: 50,  next: 100 },
  { tier: 'Bronze',  color: '#CD7F32', bg: 'rgba(205,127,50,0.14)',  at: 10,  next: 50 },
];

/** Milestone tier for a lifetime vote count, or null below Bronze. */
export function milestoneMeta(total?: number | null): MilestoneMeta | null {
  if (!total) return null;
  return MILESTONES.find((m) => total >= m.at) ?? null;
}

/** Discord-style "♥ SPRT" supporter badge (≤4 letters). Pass the lifetime vote
 *  count to colour it by milestone tier (Bronze/Silver/Gold/Diamond). */
export function SupporterBadge({ size = 13, total }: { size?: number; total?: number | null }) {
  const m = milestoneMeta(total);
  const color = m?.color ?? '#ff6b6e';
  const heart = m?.color ?? '#f23f43';
  const title = m
    ? `${m.tier} Supporter — ${total} lifetime votes${m.next ? ` (${m.next - (total ?? 0)} to ${MILESTONES.find((x) => x.at === m.next)?.tier})` : ''}`
    : 'Supporter — thanks for voting!';
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
        padding: '1px 6px', borderRadius: 6,
        background: m?.bg ?? 'rgba(242,63,67,0.16)', border: `1px solid ${m ? `${m.color}66` : 'rgba(242,63,67,0.4)'}`,
        fontSize: Math.round(size * 0.72), fontWeight: 800, color, letterSpacing: '0.04em',
        lineHeight: 1.4,
      }}
    >
      <Heart size={Math.round(size * 0.7)} fill={heart} color={heart} />
      SPRT
    </span>
  );
}

/** "🔥 N" consecutive-day vote streak chip. Renders nothing below 2 days. */
export function StreakChip({ streak, size = 13 }: { streak?: number | null; size?: number }) {
  if (!streak || streak < 2) return null;
  return (
    <span
      title={`${streak}-day vote streak — vote daily to keep it alive!`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
        padding: '1px 6px', borderRadius: 6,
        background: 'rgba(255,146,43,0.14)', border: '1px solid rgba(255,146,43,0.45)',
        fontSize: Math.round(size * 0.74), fontWeight: 800, color: '#ff922b',
        lineHeight: 1.4, whiteSpace: 'nowrap',
      }}
    >
      🔥{streak}
    </span>
  );
}
