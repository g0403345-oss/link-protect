'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, X, Plus, Info, Search } from 'lucide-react';

interface Editor { id: string; username: string | null; avatar: string | null; }
interface Member { id: string; username: string; avatar: string | null; nick: string | null; }

export default function TeamAccess({
  guildId, addToast,
}: { guildId: string; addToast: (t: 'success' | 'error', m: string) => void }) {
  const [editors, setEditors] = useState<Editor[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/guild/${guildId}/editors`);
      if (res.ok) { const d = await res.json(); setEditors(d.editors ?? []); }
    } catch { /* silent */ }
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

  // Live member search (debounced). Also accepts a raw user ID.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 1 || /^\d{15,21}$/.test(q)) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/guild/${guildId}/discord-members/search?q=${encodeURIComponent(q)}`);
        if (res.ok) { const d = await res.json(); setResults(d.members ?? []); }
      } catch { /* silent */ } finally { setSearching(false); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, guildId]);

  const save = useCallback(async (ids: string[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/editors`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editors: ids }),
      });
      if (res.status === 403) { addToast('error', 'Only server managers can change the team'); await load(); return; }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setEditors(d.editors ?? []);
      addToast('success', 'Team updated');
    } catch { addToast('error', 'Failed to update team'); }
    finally { setSaving(false); }
  }, [guildId, addToast, load]);

  const addId = (id: string) => {
    if (!editors.some((e) => e.id === id)) save([...editors.map((e) => e.id), id]);
    setQuery(''); setResults([]);
  };
  const addRawId = () => {
    const id = query.trim();
    if (!/^\d{15,21}$/.test(id)) { addToast('error', 'Type a name to search, or paste a valid user ID'); return; }
    addId(id);
  };
  const remove = (id: string) => save(editors.filter((e) => e.id !== id).map((e) => e.id));

  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>Team Access</span>
      </div>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 8 }}>
          <Info size={13} color="#5865f2" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: '#6d6f78' }}>
            Give specific people access to this server&apos;s dashboard &amp; app — without making them a Discord admin.
            They can change settings but <b>can&apos;t manage this team</b>. Only the server owner / Manage&nbsp;Server can.
          </p>
        </div>

        {/* Current editors */}
        {editors.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#52535a', fontSize: 13 }}>
            <Users size={14} /> No extra members yet — only owner &amp; Manage&nbsp;Server have access.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {editors.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8 }}>
                {e.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`https://cdn.discordapp.com/avatars/${e.id}/${e.avatar}.webp?size=32`} alt=""
                    style={{ width: 26, height: 26, borderRadius: '50%' }} />
                ) : (
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    {(e.username ?? e.id).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#f2f3f5', fontWeight: 500 }}>{e.username ?? 'Unknown user'}</div>
                  <div style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace' }}>{e.id}</div>
                </div>
                <button onClick={() => remove(e.id)} disabled={saving}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4 }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.color = '#f23f43')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.color = '#52535a')}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add by name (search) or raw ID */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7 }}>
            <Search size={14} color="#52535a" style={{ flexShrink: 0 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addRawId(); }}
              placeholder="Search members by name — or paste a user ID"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#f2f3f5', fontSize: 13, fontFamily: 'inherit' }} />
            {/^\d{15,21}$/.test(query.trim()) && (
              <button onClick={addRawId} disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#5865f2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                <Plus size={12} /> Add ID
              </button>
            )}
          </div>
          {(searching || results.length > 0) && (
            <div style={{ marginTop: 6, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              {searching && results.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#52535a' }}>Searching…</div>
              ) : (
                results.filter((m) => !editors.some((e) => e.id === m.id)).map((m) => (
                  <button key={m.id} onClick={() => addId(m.id)} disabled={saving}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = '#232329')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'none')}>
                    {m.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.webp?size=32`} alt=""
                        style={{ width: 24, height: 24, borderRadius: '50%' }} />
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                        {(m.nick ?? m.username).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#f2f3f5' }}>{m.nick ?? m.username}</div>
                      {m.nick && <div style={{ fontSize: 11, color: '#52535a' }}>{m.username}</div>}
                    </div>
                    <Plus size={13} color="#5865f2" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
