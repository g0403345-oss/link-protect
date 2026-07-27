'use client';

/**
 * Watchlist (Premium) — keep an eye on suspicious members for a limited time.
 * Lives inside a CollapsibleCard on the Warnings tab. Entries come from
 * /api/guild/{id}/watchlist; names/avatars resolve via the members endpoint.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Plus, RefreshCw, Trash2 } from 'lucide-react';
import PremiumLockNote from '@/components/PremiumLockNote';

interface WatchEntry {
  userId: string;
  until: number;    // unix seconds
  by: string;       // user id of the moderator who added it
  reason: string | null;
  added: number;    // unix seconds
}

interface ResolvedMember { id: string; username: string; nick?: string; avatar?: string | null; }

const DAY_OPTIONS = [3, 7, 14, 30];

function daysLeft(until: number): string {
  const s = until - Math.floor(Date.now() / 1000);
  if (s <= 0) return 'expiring';
  const d = Math.ceil(s / 86400);
  return d === 1 ? '1 day left' : `${d} days left`;
}

const shortId = (id: string) => `…${id.slice(-4)}`;

export default function WatchlistCard({ guildId, onToast }: {
  guildId: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}) {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Record<string, ResolvedMember>>({});

  /* add form */
  const [newId, setNewId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; username: string; nick?: string | null; avatar?: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = (q: string) => {
    setQuery(q);
    setNewId(/^\d{5,25}$/.test(q.trim()) ? q.trim() : '');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2 || /^\d+$/.test(q.trim())) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/guild/${guildId}/discord-members/search?q=${encodeURIComponent(q.trim())}`);
        const d = await res.json();
        setResults((d.members ?? []).slice(0, 8));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  };
  const [newDays, setNewDays] = useState(7);
  const [newReason, setNewReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 'add' | userId being removed

  const resolve = useCallback((ids: string[]) => {
    const missing = Array.from(new Set(ids)).filter((id) => id && !(id in members));
    if (!missing.length) return;
    fetch(`/api/guild/${guildId}/discord-members/resolve?ids=${missing.slice(0, 50).join(',')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.members) return;
        const map: Record<string, ResolvedMember> = {};
        for (const m of d.members as ResolvedMember[]) map[m.id] = m;
        setMembers((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [guildId, members]);

  const load = useCallback(() => {
    fetch(`/api/guild/${guildId}/watchlist`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEntries((d.entries ?? []) as WatchEntry[]);
        setPremium(!!d.premium);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [guildId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    resolve(entries.map((e) => e.userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const add = async () => {
    const id = newId.trim();
    if (!/^\d{5,25}$/.test(id)) { onToast('error', 'Enter a valid Discord user ID'); return; }
    setBusy('add');
    try {
      const res = await fetch(`/api/guild/${guildId}/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, days: newDays, reason: newReason.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 403) { onToast('error', d.detail ?? 'Premium feature'); return; }
      if (!res.ok) { onToast('error', d.error ?? 'Could not add to the watchlist'); return; }
      onToast('success', `Watching ${shortId(id)} for ${newDays} days`);
      setNewId(''); setNewReason('');
      load();
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setBusy(null); }
  };

  const remove = async (userId: string) => {
    setBusy(userId);
    try {
      const res = await fetch(`/api/guild/${guildId}/watchlist/${userId}`, { method: 'DELETE' });
      if (!res.ok) { onToast('error', 'Could not remove the entry'); return; }
      setEntries((prev) => prev.filter((e) => e.userId !== userId));
      onToast('success', 'Removed from the watchlist');
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setBusy(null); }
  };

  const input = { padding: '9px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' } as const;

  if (loading) {
    return <p style={{ fontSize: 13, color: '#52535a' }}>Loading…</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: '#52535a', marginBottom: 14 }}>
        Members on the watchlist get every message checked with the strictest rules for a
        limited time — perfect for &ldquo;one more chance&rdquo; cases. Entries expire on their own.
      </p>

      {/* Entries */}
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Eye size={22} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#52535a' }}>Nobody on the watchlist</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
          {entries.map((e) => {
            const m = members[e.userId];
            const name = m ? (m.nick ?? m.username) : shortId(e.userId);
            const byName = e.by;
            return (
              <div key={e.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8 }}>
                {m?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`https://cdn.discordapp.com/avatars/${e.userId}/${m.avatar}.webp?size=64`} alt=""
                    style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(88,101,242,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#96a4ff', flexShrink: 0 }}>
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>{name}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1.5px 7px', borderRadius: 99, background: 'rgba(88,101,242,0.14)', color: '#96a4ff' }}>{daysLeft(e.until)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#52535a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.reason ? `${e.reason} · ` : ''}by {byName}
                  </p>
                </div>
                <button onClick={() => remove(e.userId)} disabled={busy !== null} title="Remove from watchlist"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4, transition: 'color 0.15s', flexShrink: 0 }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.color = '#f23f43')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.color = '#52535a')}>
                  {busy === e.userId ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form / lock note */}
      {premium === false ? (
        <div style={{ marginTop: 10 }}>
          <PremiumLockNote text="Watch suspicious members — a Premium extra. Protection itself stays free." />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <input value={query} onChange={(e) => search(e.target.value)}
              placeholder="Search member by name — or paste an ID" maxLength={60}
              style={{ ...input, width: '100%' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
              onBlur={(e) => setTimeout(() => (e.target.style.borderColor = '#2e2e36'), 150)} />
            {(results.length > 0 || searching) && (
              <div style={{ position: 'absolute', top: '105%', left: 0, right: 0, zIndex: 20, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 9, overflow: 'hidden', boxShadow: '0 14px 34px rgba(0,0,0,0.5)' }}>
                {searching && <div style={{ padding: '9px 12px', fontSize: 12, color: '#6d6f78' }}>Searching…</div>}
                {results.map((m) => (
                  <button key={m.id}
                    onMouseDown={(ev) => { ev.preventDefault(); setNewId(m.id); setQuery(m.nick ?? m.username); setResults([]); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = 'rgba(88,101,242,0.1)')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'none')}>
                    {m.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.webp?size=32`} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                    ) : (
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2e2e36', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#949ba4' }}>{(m.username || '?').slice(0, 2).toUpperCase()}</span>
                    )}
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#f2f3f5' }}>{m.nick ?? m.username}</span>
                    <span style={{ fontSize: 10.5, color: '#52535a', fontFamily: 'monospace', marginLeft: 'auto' }}>…{m.id.slice(-4)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={newDays} onChange={(e) => setNewDays(parseInt(e.target.value))}
            style={{ ...input, cursor: 'pointer' }}>
            {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
          <input value={newReason} onChange={(e) => setNewReason(e.target.value)}
            placeholder="Reason (optional)" maxLength={200}
            style={{ ...input, flex: '2 1 180px' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
          <button onClick={add} disabled={!newId.trim() || busy !== null}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: !newId.trim() || busy !== null ? 0.4 : 1 }}>
            {busy === 'add' ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Watch
          </button>
        </div>
      )}
    </div>
  );
}
