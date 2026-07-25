'use client';

/**
 * Activity log as a real timeline (redesign point 5): grouped by day, real
 * Discord avatars (resolved in one batch, initials as fallback), filter chips
 * per action type and expandable rows with the full reason & details.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Activity } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

export interface TimelineAction {
  user_id: string; username: string; channel_id: string;
  action: 'warned' | 'kicked' | 'banned' | 'timeout';
  reason: string; warn_count: number; timestamp: number;
}

const META: Record<string, { label: string; color: string }> = {
  warned:  { label: 'Warned',  color: '#f0b232' },
  kicked:  { label: 'Kicked',  color: '#e0683c' },
  banned:  { label: 'Banned',  color: '#f23f43' },
  timeout: { label: 'Timeout', color: '#5865f2' },
};

function relTime(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function ActivityTimeline({ guildId, actions, onNavigate }: {
  guildId: string;
  actions: TimelineAction[];
  onNavigate: (section: string) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  // Resolve avatars for the users on screen — one batched request.
  useEffect(() => {
    const ids = Array.from(new Set(actions.slice(0, 100).map((a) => a.user_id))).filter((id) => !(id in avatars));
    if (!ids.length) return;
    fetch(`/api/guild/${guildId}/discord-members/resolve?ids=${ids.slice(0, 50).join(',')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.members) return;
        const map: Record<string, string | null> = {};
        for (const m of d.members as { id: string; avatar?: string | null }[]) map[m.id] = m.avatar ?? null;
        setAvatars((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, actions]);

  const filtered = useMemo(
    () => (filter === 'all' ? actions : actions.filter((a) => a.action === filter)),
    [actions, filter]
  );

  // Group consecutive actions by calendar day.
  const groups = useMemo(() => {
    const out: { label: string; items: { a: TimelineAction; idx: number }[] }[] = [];
    filtered.forEach((a, idx) => {
      const label = dayLabel(a.timestamp);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push({ a, idx });
      else out.push({ label, items: [{ a, idx }] });
    });
    return out;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: actions.length };
    for (const a of actions) c[a.action] = (c[a.action] ?? 0) + 1;
    return c;
  }, [actions]);

  if (actions.length === 0) {
    return (
      <EmptyState icon={Activity} color="#23a55a"
        title="Nothing to moderate — nice."
        sub="When Link Protect warns, kicks, bans or times someone out, it shows up here the second it happens."
        cta={{ label: 'Check your blockers', onClick: () => onNavigate('blockers') }} />
    );
  }

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {['all', 'warned', 'kicked', 'banned', 'timeout'].map((f) => {
          const active = filter === f;
          const color = f === 'all' ? '#96a4ff' : META[f].color;
          const n = counts[f] ?? 0;
          return (
            <button key={f} onClick={() => { setFilter(f); setOpen(null); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 99, cursor: 'pointer', border: `1px solid ${active ? `${color}66` : '#2e2e36'}`, background: active ? `${color}14` : 'transparent', color: active ? color : '#6d6f78', transition: 'all 0.13s' }}>
              {f === 'all' ? 'All' : META[f].label}
              <span style={{ fontSize: 10.5, opacity: 0.75 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: 22 }}>
        <div aria-hidden style={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: 2, background: 'linear-gradient(180deg, #2e2e36, #1a1a1e)' }} />
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 18 }}>
            <div style={{ position: 'relative', fontSize: 11, fontWeight: 800, color: '#52535a', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
              <span aria-hidden style={{ position: 'absolute', left: -19, top: 3, width: 8, height: 8, borderRadius: '50%', background: '#2e2e36', border: '2px solid #0e0e11' }} />
              {g.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.items.map(({ a, idx }) => {
                const meta = META[a.action] ?? META.warned;
                const isOpen = open === idx;
                const av = avatars[a.user_id];
                return (
                  <div key={idx} className="log-row"
                    style={{ borderRadius: 9, background: isOpen ? 'rgba(88,101,242,0.05)' : 'transparent', border: `1px solid ${isOpen ? '#2e2e36' : 'transparent'}`, transition: 'all 0.15s' }}>
                    <button onClick={() => setOpen(isOpen ? null : idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      {av ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`https://cdn.discordapp.com/avatars/${a.user_id}/${av}.webp?size=64`} alt=""
                          style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 }} />
                      ) : (
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: `${meta.color}1c`, color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                          {(a.username || '??').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f2f3f5' }}>{a.username}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '1.5px 7px', borderRadius: 99, background: `${meta.color}16`, color: meta.color }}>{meta.label}</span>
                        <span style={{ fontSize: 11.5, color: '#6d6f78', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>{a.reason}</span>
                      </span>
                      <span style={{ fontSize: 11, color: '#52535a', flexShrink: 0 }}>{relTime(a.timestamp)}</span>
                      <ChevronDown size={13} color="#52535a" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {isOpen && (
                      <div style={{ padding: '2px 12px 11px 46px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ fontSize: 12.5, color: '#b5bac1', lineHeight: 1.55 }}>{a.reason}</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: '#6d6f78' }}>
                          <span>Warning <b style={{ color: meta.color }}>#{a.warn_count}</b></span>
                          {a.channel_id !== '0' && <span style={{ fontFamily: 'monospace' }}>channel …{a.channel_id.slice(-4)}</span>}
                          <span>{new Date(a.timestamp * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ fontSize: 13, color: '#6d6f78', padding: '10px 0 4px' }}>No {META[filter]?.label.toLowerCase()} entries in the recent log.</p>
        )}
      </div>
    </div>
  );
}
