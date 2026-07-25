'use client';

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import type { SupporterWallEntry } from '@/lib/db';

// "Supported this month by …" — every voter of the current month gets their
// avatar on the wall (voter perk advertised in the vote popup / leaderboard).
export default function SupporterWall() {
  const [data, setData] = useState<{ count: number; supporters: SupporterWallEntry[] } | null>(null);

  useEffect(() => {
    fetch('/api/supporters')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setData({ count: d.count ?? 0, supporters: d.supporters ?? [] }); })
      .catch(() => {});
  }, []);

  if (data === null) {
    // Reserve the section's height while loading so the landing doesn't jump.
    return (
      <div style={{ maxWidth: 860, margin: '28px auto 0', display: 'flex', justifyContent: 'center', gap: 8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%' }} />
        ))}
      </div>
    );
  }
  if (data.supporters.length === 0) return null;
  const extra = data.count - data.supporters.length;

  return (
    <div style={{ maxWidth: 860, margin: '28px auto 0', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#ff6b6e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
        <Heart size={13} fill="#f23f43" color="#f23f43" />
        Supported this month by {data.count} {data.count === 1 ? 'voter' : 'voters'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        {data.supporters.map((s) => (
          <div key={s.id} title={`${s.username ?? `User …${s.id.slice(-4)}`} · ${s.votes} ${s.votes === 1 ? 'vote' : 'votes'} this month`}
            style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: '#2e2e36', border: '1px solid #3a3a42', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', transition: 'transform 0.12s' }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
            {s.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 12, fontWeight: 800, color: '#6d6f78' }}>
                {(s.username ?? s.id).slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        ))}
        {extra > 0 && (
          <div style={{ height: 36, padding: '0 12px', borderRadius: 99, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 700, color: '#949ba4' }}>
            +{extra} more
          </div>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: '#52535a', marginTop: 14 }}>
        Vote once and your avatar joins the wall for the rest of the month.
      </p>
    </div>
  );
}
