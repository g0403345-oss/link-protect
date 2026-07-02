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

/** Discord-style "♥ SPRT" supporter badge (≤4 letters). */
export function SupporterBadge({ size = 13 }: { size?: number }) {
  return (
    <span
      title="Supporter — thanks for voting!"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
        padding: '1px 6px', borderRadius: 6,
        background: 'rgba(242,63,67,0.16)', border: '1px solid rgba(242,63,67,0.4)',
        fontSize: Math.round(size * 0.72), fontWeight: 800, color: '#ff6b6e', letterSpacing: '0.04em',
        lineHeight: 1.4,
      }}
    >
      <Heart size={Math.round(size * 0.7)} fill="#f23f43" color="#f23f43" />
      SPRT
    </span>
  );
}
