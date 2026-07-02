'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Loader2 } from 'lucide-react';

interface DiscordChannel { id: string; name: string; type: number; position: number; parent_id?: string | null; }
interface DiscordRole { id: string; name: string; color: number; position: number; }
interface DiscordMember { id: string; username: string; avatar?: string | null; nick?: string | null; }

export type PickerType = 'channel' | 'category' | 'role' | 'member';

interface Props {
  title: string;
  description: string;
  icon: React.ReactNode;
  pickerType: PickerType;
  guildId: string;
  value: string[];
  onSave: (ids: string[]) => void;
  saving: boolean;
}

function channelIcon(type: number) {
  if (type === 2 || type === 13) return '🔊';
  if (type === 15 || type === 16) return '≡';
  if (type === 5) return '📢';
  return '#';
}

function roleColor(color: number) {
  return color !== 0 ? `#${color.toString(16).padStart(6, '0')}` : '#52535a';
}

export default function PickerList({ title, description, icon, pickerType, guildId, value, onSave, saving }: Props) {
  const [selected, setSelected] = useState<string[]>(value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [memberResults, setMemberResults] = useState<DiscordMember[]>([]);
  const [resolvedMembers, setResolvedMembers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const memberTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasChanges = JSON.stringify([...selected].sort()) !== JSON.stringify([...value].sort());

  useEffect(() => { setSelected(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const loadItems = useCallback(async () => {
    if (loaded || pickerType === 'member') return;
    setFetchLoading(true);
    try {
      if (pickerType === 'channel' || pickerType === 'category') {
        const res = await fetch(`/api/guild/${guildId}/discord-channels`);
        const data = await res.json();
        setChannels(data.channels ?? []);
      } else {
        const res = await fetch(`/api/guild/${guildId}/discord-roles`);
        const data = await res.json();
        setRoles(data.roles ?? []);
      }
      setLoaded(true);
    } catch { /* silent */ }
    setFetchLoading(false);
  }, [guildId, pickerType, loaded]);

  useEffect(() => {
    if (pickerType !== 'member') return;
    if (memberTimer.current) clearTimeout(memberTimer.current);
    if (!open || search.length < 1) { setMemberResults([]); return; }
    memberTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/guild/${guildId}/discord-members/search?q=${encodeURIComponent(search)}`);
      const data = await res.json();
      setMemberResults(data.members ?? []);
    }, 300);
    return () => { if (memberTimer.current) clearTimeout(memberTimer.current); };
  }, [search, open, guildId, pickerType]);

  const handleOpen = () => { setOpen(true); loadItems(); };

  // Load channel/role lists up-front so existing chips show names immediately,
  // without the user having to open the dropdown.
  useEffect(() => { loadItems(); }, [loadItems]);

  // Resolve whitelisted member IDs → names so chips aren't raw IDs.
  useEffect(() => {
    if (pickerType !== 'member' || value.length === 0) return;
    const missing = value.filter((id) => !(id in resolvedMembers));
    if (missing.length === 0) return;
    fetch(`/api/guild/${guildId}/discord-members/resolve?ids=${missing.join(',')}`)
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {};
        for (const m of (d.members ?? []) as DiscordMember[]) map[m.id] = m.nick ?? m.username;
        if (Object.keys(map).length) setResolvedMembers((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [pickerType, value, guildId, resolvedMembers]);

  const resolveName = (id: string): string => {
    if (pickerType === 'channel') {
      const ch = channels.find(c => c.id === id);
      return ch ? `${channelIcon(ch.type)} ${ch.name}` : `#…${id.slice(-4)}`;
    }
    if (pickerType === 'category') {
      return channels.find(c => c.id === id && c.type === 4)?.name ?? `…${id.slice(-4)}`;
    }
    if (pickerType === 'role') {
      return roles.find(r => r.id === id)?.name ?? `@…${id.slice(-4)}`;
    }
    const m = memberResults.find(m => m.id === id);
    if (m) return m.nick ?? m.username;
    if (resolvedMembers[id]) return resolvedMembers[id];
    return `@…${id.slice(-4)}`;
  };

  const resolveRoleColor = (id: string) => {
    const r = roles.find(r => r.id === id);
    return r ? roleColor(r.color) : '#52535a';
  };

  const addItem = (id: string) => {
    if (!selected.includes(id)) setSelected(prev => [...prev, id]);
    setSearch('');
    setMemberResults([]);
  };

  const removeItem = (id: string) => setSelected(prev => prev.filter(i => i !== id));

  // Filtered available items
  const q = search.toLowerCase();
  const availableChannels = channels.filter(c => {
    const isCategory = c.type === 4;
    if (pickerType === 'category' && !isCategory) return false;
    if (pickerType === 'channel' && isCategory) return false;
    return !selected.includes(c.id) && c.name.toLowerCase().includes(q);
  });

  const availableRoles = roles.filter(r => !selected.includes(r.id) && r.name.toLowerCase().includes(q));
  const availableMembers = memberResults.filter(m => !selected.includes(m.id));

  // Group non-category channels by parent category
  const grouped = new Map<string | null, DiscordChannel[]>();
  if (pickerType === 'channel') {
    for (const ch of availableChannels) {
      const key = ch.parent_id ?? null;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ch);
    }
  }

  const getCatName = (id: string | null) =>
    id ? (channels.find(c => c.id === id && c.type === 4)?.name ?? 'Unknown') : 'Uncategorized';

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '5px 14px', fontSize: 12, fontWeight: 500, color: '#b5bac1',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.1s, color 0.1s',
  };

  const emptyMsg = (msg: string) => (
    <div style={{ padding: '10px 14px', fontSize: 12, color: '#52535a' }}>{msg}</div>
  );

  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#d4d4d4' }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>{description}</p>

      {/* Selected chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {selected.map(id => (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 10px', fontSize: 12, fontWeight: 500, background: '#1e1e22', border: '1px solid #2e2e36', borderRadius: 99, color: '#c4c4c8' }}>
            {pickerType === 'role' && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: resolveRoleColor(id), flexShrink: 0 }} />
            )}
            {resolveName(id)}
            <button onClick={() => removeItem(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 0, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f23f43')}
              onMouseLeave={e => (e.currentTarget.style.color = '#52535a')}>
              <X size={11} />
            </button>
          </span>
        ))}

        {/* Add button + dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button onClick={handleOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 12, fontWeight: 500, background: 'transparent', border: '1px dashed #2e2e36', borderRadius: 99, color: '#52535a', cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#5865f2'; e.currentTarget.style.color = '#5865f2'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2e36'; e.currentTarget.style.color = '#52535a'; }}>
            + Add
          </button>

          {open && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', width: 260 }}>
              {/* Search */}
              <div style={{ padding: '8px 8px 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#111113', border: '1px solid #2e2e36', borderRadius: 7 }}>
                  {fetchLoading ? <Loader2 size={12} color="#52535a" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <Search size={12} color="#52535a" style={{ flexShrink: 0 }} />}
                  <input ref={searchRef} type="text"
                    placeholder={pickerType === 'member' ? 'Search by username…' : `Search ${pickerType}s…`}
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#f2f3f5', fontFamily: 'inherit' }} />
                </div>
              </div>

              {/* Results */}
              <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0 8px' }}>
                {pickerType === 'channel' && (
                  grouped.size === 0
                    ? emptyMsg(fetchLoading ? 'Loading…' : 'No channels found')
                    : Array.from(grouped.entries()).map(([catId, chans]) => (
                      <div key={catId ?? 'none'}>
                        <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {getCatName(catId)}
                        </div>
                        {chans.map(ch => (
                          <button key={ch.id} style={btnStyle} onClick={() => addItem(ch.id)}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#232329'; (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#b5bac1'; }}>
                            <span style={{ color: '#52535a', fontSize: 13, fontFamily: 'monospace', flexShrink: 0 }}>{channelIcon(ch.type)}</span>
                            {ch.name}
                          </button>
                        ))}
                      </div>
                    ))
                )}

                {pickerType === 'category' && (
                  availableChannels.length === 0
                    ? emptyMsg(fetchLoading ? 'Loading…' : 'No categories found')
                    : availableChannels.map(ch => (
                      <button key={ch.id} style={btnStyle} onClick={() => addItem(ch.id)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#232329'; (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#b5bac1'; }}>
                        📁 {ch.name}
                      </button>
                    ))
                )}

                {pickerType === 'role' && (
                  availableRoles.length === 0
                    ? emptyMsg(fetchLoading ? 'Loading…' : 'No roles found')
                    : availableRoles.map(r => (
                      <button key={r.id} style={btnStyle} onClick={() => addItem(r.id)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#232329'; (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#b5bac1'; }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: roleColor(r.color), flexShrink: 0 }} />
                        {r.name}
                      </button>
                    ))
                )}

                {pickerType === 'member' && (
                  search.length < 1
                    ? emptyMsg('Type a username to search…')
                    : availableMembers.length === 0
                      ? emptyMsg('No members found')
                      : availableMembers.map(m => (
                        <button key={m.id} style={btnStyle} onClick={() => addItem(m.id)}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#232329'; (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#b5bac1'; }}>
                          {m.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.webp?size=32`} alt=""
                              style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {(m.nick ?? m.username)[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{m.nick ?? m.username}</div>
                            {m.nick && <div style={{ fontSize: 11, color: '#52535a' }}>{m.username}</div>}
                          </div>
                        </button>
                      ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      {hasChanges && (
        <button onClick={() => onSave(selected)} disabled={saving}
          style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, background: saving ? '#2e2e36' : '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.15s' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
}
