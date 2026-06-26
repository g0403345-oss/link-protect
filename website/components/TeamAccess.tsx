'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, X, Plus, Info } from 'lucide-react';

interface Editor { id: string; username: string | null; avatar: string | null; }

export default function TeamAccess({
  guildId, addToast,
}: { guildId: string; addToast: (t: 'success' | 'error', m: string) => void }) {
  const [editors, setEditors] = useState<Editor[]>([]);
  const [newId, setNewId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/guild/${guildId}/editors`);
      if (res.ok) { const d = await res.json(); setEditors(d.editors ?? []); }
    } catch { /* silent */ }
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

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

  const add = () => {
    const id = newId.trim();
    if (!/^\d{15,21}$/.test(id)) { addToast('error', 'Enter a valid Discord user ID'); return; }
    if (editors.some((e) => e.id === id)) { setNewId(''); return; }
    save([...editors.map((e) => e.id), id]);
    setNewId('');
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

        {/* Add */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newId} onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="Discord user ID (e.g. 624317230955626507)"
            style={{ flex: 1, padding: '9px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, color: '#f2f3f5', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={add} disabled={!newId.trim() || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!newId.trim() || saving) ? 0.4 : 1 }}>
            <Plus size={14} /> Add
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#52535a' }}>
          Tip: enable Developer Mode in Discord, right-click a user → Copy User ID.
        </p>
      </div>
    </div>
  );
}
