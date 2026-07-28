'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Hash, Info, ShieldOff, Server, Target, ChevronDown, Users, Shield } from 'lucide-react';
import ToggleSwitch from '@/components/ToggleSwitch';
import PickerList from '@/components/PickerList';
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
  { key: 'files', label: 'Dangerous Files' },
  { key: 'webhook', label: 'Webhook Guard' },
  { key: 'mentions', label: 'Mention Spam' },
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
  // Channel just created from the add-search — scroll its editor into view
  // once the refreshed overrides contain it.
  const [justAdded, setJustAdded] = useState<string | null>(null);

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
    async (channelId: string, init: RequestInit, successMsg = 'Channel rule saved') => {
      setBusy(channelId);
      try {
        const res = await fetch(`/api/guild/${guildId}/override/${channelId}`, init);
        if (!res.ok) throw new Error();
        addToast('success', successMsg);
        onSaved();
      } catch {
        addToast('error', 'Failed to save channel rule');
      } finally {
        setBusy(null);
      }
    },
    [guildId, onSaved, addToast]
  );

  // A fresh rule starts in 'custom' mode (nothing blocked until you pick) —
  // never 'off', which silently disabled Link Protect in that channel.
  const addRule = useCallback(async (channelId: string) => {
    const body: ChannelOverride = { mode: 'custom', protect: {} };
    await callApi(channelId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      'Rule created — pick what changes below');
    setJustAdded(channelId);
  }, [callApi]);

  useEffect(() => {
    if (!justAdded || !(justAdded in (overrides ?? {}))) return;
    const el = document.getElementById(`channel-rule-${justAdded}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setJustAdded(null);
    }
  }, [justAdded, overrides]);

  const setMode = (channelId: string, mode: Mode, current?: ChannelOverride) => {
    if (mode === 'default') return callApi(channelId, { method: 'DELETE' });
    const body: ChannelOverride =
      mode === 'off'
        ? { mode: 'off' }
        : { mode: 'custom', protect: current?.mode === 'custom' ? current.protect ?? {} : {} };
    return callApi(channelId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  const toggleBlocker = (channelId: string, ov: ChannelOverride, key: string, val: boolean) => {
    // Keep allow + silent so toggling a blocker never wipes the exception list.
    const body: ChannelOverride = { mode: 'custom', protect: { ...(ov.protect ?? {}), [key]: val }, allow: ov.allow, silent: ov.silent };
    return callApi(channelId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  const setAllow = (channelId: string, ov: ChannelOverride, kind: 'member' | 'role', ids: string[]) => {
    const body: ChannelOverride = {
      mode: 'custom', protect: ov.protect ?? {}, silent: ov.silent,
      allow: { enabled: ov.allow?.enabled ?? true, member: ov.allow?.member ?? [], role: ov.allow?.role ?? [], [kind]: ids },
    };
    return callApi(channelId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };

  const setAllowEnabled = (channelId: string, ov: ChannelOverride, enabled: boolean) => {
    const body: ChannelOverride = {
      mode: 'custom', protect: ov.protect ?? {}, silent: ov.silent,
      allow: { enabled, member: ov.allow?.member ?? [], role: ov.allow?.role ?? [] },
    };
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
                    onClick={() => { addRule(c.id); setAdding(false); setSearch(''); }}
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
            <div key={cid} id={`channel-rule-${cid}`} style={{ ...card(), overflow: 'hidden' }}>
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

                    {/* Per-channel exceptions: who may still post despite the blockers above */}
                    {(() => {
                      const restrictOn = ov.allow?.enabled ?? ((ov.allow?.member?.length ?? 0) + (ov.allow?.role?.length ?? 0) > 0);
                      const exCount = (ov.allow?.member?.length ?? 0) + (ov.allow?.role?.length ?? 0);
                      const anyBlocker = BLOCKERS.some(({ key }) => ov.protect?.[key]);
                      return (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #232329' }}>
                          <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: '2px 14px' }}>
                            <ToggleSwitch
                              checked={restrictOn}
                              onChange={(v) => setAllowEnabled(cid, ov, v)}
                              disabled={busy === cid}
                              label="Restrict who can post here"
                              description="Only the members & roles you pick may post the blocked link types — everyone else is blocked"
                              size="sm"
                            />
                          </div>
                          {restrictOn && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <PickerList
                                title="Allowed members" description="These users bypass this channel's blockers"
                                icon={<Users size={13} color="#23a55a" />} pickerType="member" guildId={guildId}
                                value={ov.allow?.member ?? []} onSave={(v) => setAllow(cid, ov, 'member', v)}
                                saving={busy === cid}
                              />
                              <PickerList
                                title="Allowed roles" description="Members with these roles bypass this channel's blockers"
                                icon={<Shield size={13} color="#f0b232" />} pickerType="role" guildId={guildId}
                                value={ov.allow?.role ?? []} onSave={(v) => setAllow(cid, ov, 'role', v)}
                                saving={busy === cid}
                              />
                            </div>
                          )}
                          {/* Plain-language summary of the resulting behaviour */}
                          <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 8 }}>
                            <Info size={13} color="#5865f2" style={{ flexShrink: 0, marginTop: 1 }} />
                            <p style={{ fontSize: 12, color: '#6d6f78', lineHeight: 1.5 }}>
                              {!anyBlocker
                                ? <>No blockers are on here, so <b>everyone can post everything</b> in this channel.</>
                                : restrictOn
                                  ? (exCount > 0
                                      ? <>Right now: <b style={{ color: '#c9ccd4' }}>only the {exCount} chosen member{exCount === 1 ? '' : 's'}/role{exCount === 1 ? '' : 's'}</b> may post the blocked link types here — everyone else is blocked.</>
                                      : <>Restriction is on but the list is empty, so <b>nobody</b> may post the blocked link types here yet — add members or roles above.</>)
                                  : <>The blocked link types apply to <b>everyone</b> here (no exceptions). Turn on the switch to let specific members/roles through.</>}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
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
