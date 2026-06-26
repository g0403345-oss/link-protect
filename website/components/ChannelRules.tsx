'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Hash, Info, ShieldOff, Server, Target, ChevronDown } from 'lucide-react';
import ToggleSwitch from '@/components/ToggleSwitch';
import type { ChannelOverride, ServerData } from '@/lib/db';

interface DiscordChannel { id: string; name: string; type: number; parent_id?: string | null; }

const BLOCKERS: { key: keyof ServerData['protect']; label: string }[] = [
  { key: 'all', label: 'All Links' },
  { key: 'nsfw', label: 'NSFW' },
  { key: 'nitro', label: 'Nitro Scams' },
  { key: 'malware', label: 'Malware / Phishing' },
  { key: 'invite', label: 'Discord Invites' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'google', label: 'Google' },
  { key: 'gif', label: 'GIFs' },
  { key: 'twitch', label: 'Twitch' },
  { key: 'steam', label: 'Steam' },
  { key: 'bit', label: 'Shorteners (bit.ly)' },
];

type Mode = 'default' | 'off' | 'custom';

const MODES: { id: Mode; label: string; icon: typeof Server; color: string; desc: string }[] = [
  { id: 'default', label: 'Follows server', icon: Server, color: '#5865f2', desc: 'Uses your normal server-wide blockers in this channel.' },
  { id: 'off', label: 'Off', icon: ShieldOff, color: '#f0b232', desc: 'Link Protect ignores this channel completely — nothing is blocked here.' },
  { id: 'custom', label: 'Custom rules', icon: Target, color: '#23a55a', desc: 'This channel uses its own blockers, independent of the server.' },
];

interface Props {
  guildId: string;
  overrides: Record<string, ChannelOverride>;
  onSaved: () => void;
  addToast: (type: 'success' | 'error', message: string) => void;
}

export default function ChannelRules({ guildId, overrides, onSaved, addToast }: Props) {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/guild/${guildId}/discord-channels`)
      .then((r) => r.json())
      .then((d) => setChannels(d.channels ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [guildId]);

  // Only text/announcement channels can carry rules.
  const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);
  const channelName = useCallback(
    (id: string) => textChannels.find((c) => c.id === id)?.name ?? `…${id.slice(-4)}`,
    [textChannels]
  );

  const ruledIds = Object.keys(overrides ?? {});
  const available = textChannels.filter((c) => !ruledIds.includes(c.id) && c.name.toLowerCase().includes(search.toLowerCase()));

  const callApi = useCallback(
    async (channelId: string, init: RequestInit) => {
      setBusy(channelId);
      try {
        const res = await fetch(`/api/guild/${guildId}/override/${channelId}`, init);
        if (!res.ok) throw new Error();
        addToast('success', 'Channel rule saved');
        onSaved();
      } catch {
        addToast('error', 'Failed to save channel rule');
      } finally {
        setBusy(null);
      }
    },
    [guildId, onSaved, addToast]
  );

  const setMode = (channelId: string, mode: Mode, current?: ChannelOverride) => {
    if (mode === 'default') return callApi(channelId, { method: 'DELETE' });
    const body: ChannelOverride =
      mode === 'off'
        ? { mode: 'off' }
        : { mode: 'custom', protect: current?.mode === 'custom' ? current.protect ?? {} : {} };
    return callApi(channelId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  const toggleBlocker = (channelId: string, ov: ChannelOverride, key: string, val: boolean) => {
    const body: ChannelOverride = { mode: 'custom', protect: { ...(ov.protect ?? {}), [key]: val } };
    return callApi(channelId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  const card = (bg = '#111113'): React.CSSProperties => ({ background: bg, border: '1px solid #1e1e22', borderRadius: 10 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Explainer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 10 }}>
        <Info size={15} color="#5865f2" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 13, color: '#c4c4c8', fontWeight: 600, marginBottom: 3 }}>Per-channel rules let one channel behave differently from the rest of the server.</p>
          <p style={{ fontSize: 12, color: '#6d6f78', lineHeight: 1.5 }}>
            Every channel <b>follows your server settings</b> by default. Override a channel to either turn Link&nbsp;Protect
            <b> off</b> there (e.g. a #links or #memes channel), or give it <b>custom rules</b> so only the blockers you pick apply.
            Channels without a rule below are unaffected.
          </p>
        </div>
      </div>

      {/* Add a rule */}
      <div style={{ ...card(), padding: 14, position: 'relative' }}>
        <button
          onClick={() => setAdding((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#f2f3f5', fontSize: 13, fontWeight: 600 }}
        >
          <Plus size={15} color="#5865f2" /> Add a channel rule
          <ChevronDown size={14} color="#52535a" style={{ marginLeft: 'auto', transform: adding ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {adding && (
          <div style={{ marginTop: 12 }}>
            <input
              autoFocus
              placeholder="Search channel…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, color: '#f2f3f5', fontSize: 13, outline: 'none', marginBottom: 8, fontFamily: 'inherit' }}
            />
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!loaded ? (
                <p style={{ fontSize: 12, color: '#52535a', padding: 8 }}>Loading channels…</p>
              ) : available.length === 0 ? (
                <p style={{ fontSize: 12, color: '#52535a', padding: 8 }}>No channels found</p>
              ) : (
                available.slice(0, 50).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setMode(c.id, 'off'); setAdding(false); setSearch(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#b5bac1', fontSize: 13, textAlign: 'left' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#232329')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'none')}
                  >
                    <Hash size={13} color="#52535a" /> {c.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Existing rules */}
      {ruledIds.length === 0 ? (
        <div style={{ ...card(), padding: '28px 0', textAlign: 'center' }}>
          <Target size={26} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: 13, color: '#52535a' }}>No channel rules yet — every channel follows the server settings.</p>
        </div>
      ) : (
        ruledIds.map((cid) => {
          const ov = overrides[cid];
          const mode: Mode = ov?.mode ?? 'default';
          return (
            <div key={cid} style={{ ...card(), overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #1e1e22' }}>
                <Hash size={15} color="#5865f2" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f2f3f5' }}>{channelName(cid)}</span>
                <button
                  onClick={() => setMode(cid, 'default')}
                  disabled={busy === cid}
                  title="Remove rule (follow server)"
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, color: '#6d6f78', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 6, cursor: 'pointer' }}
                >
                  <X size={11} /> Remove
                </button>
              </div>

              <div style={{ padding: 16 }}>
                {/* Mode selector */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: mode === 'custom' ? 16 : 0 }}>
                  {MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMode(cid, m.id, ov)}
                        disabled={busy === cid}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', background: active ? `${m.color}14` : '#18181b', border: `1px solid ${active ? m.color : '#2e2e36'}`, transition: 'all 0.15s' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <m.icon size={13} color={active ? m.color : '#6d6f78'} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: active ? m.color : '#b5bac1' }}>{m.label}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#52535a', lineHeight: 1.4 }}>{m.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom blockers */}
                {mode === 'custom' && (
                  <div>
                    <p style={{ fontSize: 12, color: '#6d6f78', marginBottom: 6 }}>
                      Only the blockers switched on below apply in this channel — server settings are ignored here.
                    </p>
                    <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: '2px 14px' }}>
                      {BLOCKERS.map(({ key, label }, i) => (
                        <div key={key} style={{ borderBottom: i < BLOCKERS.length - 1 ? '1px solid #232329' : 'none' }}>
                          <ToggleSwitch
                            checked={!!ov.protect?.[key]}
                            onChange={(v) => toggleBlocker(cid, ov, key, v)}
                            disabled={busy === cid}
                            label={label}
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
