'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, ChevronDown, Hash, Check, XCircle, Megaphone } from 'lucide-react';
import ToggleSwitch from '@/components/ToggleSwitch';

interface DiscordChannel { id: string; name: string; type: number; position: number; parent_id?: string | null; }

interface Props {
  guildId: string;
  /** Current `log.log-channel` (0 = disabled). String to keep snowflake precision. */
  channelId: number | string;
  /** Mirrors the bot's `log.Activated` flag. */
  activated: boolean;
  /** Page-level patch helper: (path, value, label). */
  onPatch: (path: string, value: unknown, label?: string) => void;
  /** The setting path currently saving, or null. */
  saving: string | null;
  /** Per-category log filter (`log.show.*`) — absent keys use the defaults. */
  show?: Record<string, boolean>;
  /** Mirrors `log.digest` — one daily summary embed instead of per-action messages. */
  digest?: boolean;
}

// What can appear in the log — everything defaults to on except verifications.
const LOG_KINDS: { key: string; label: string; defaultOn: boolean }[] = [
  { key: 'automod', label: 'Blocked links', defaultOn: true },
  { key: 'manual', label: 'Manual warns', defaultOn: true },
  { key: 'scamshield', label: 'Scam Shield', defaultOn: true },
  { key: 'raid', label: 'Raid alarms', defaultOn: true },
  { key: 'lockdown', label: 'Lockdown', defaultOn: true },
  { key: 'verify', label: 'Verifications', defaultOn: false },
];

/** Only channels the bot can actually post to: text + announcement. */
function isTextChannel(type: number) {
  return type === 0 || type === 5;
}

/**
 * Warn-Log channel picker — the dashboard equivalent of `/enable-warn-log` and
 * `/disable-warn-log`. Selecting a channel writes `log.log-channel` and turns on
 * `log.Activated`; "Disable" clears the channel and the flag.
 */
export default function WarnLogConfig({ guildId, channelId, activated, onPatch, saving, show, digest }: Props) {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isSaving = saving === 'log.log-channel' || saving === 'log.Activated';
  const currentId = channelId && channelId !== 0 ? String(channelId) : '';
  const enabled = activated && currentId !== '' && currentId !== '0';
  const current = channels.find((c) => c.id === currentId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 50); }, [open]);

  const load = useCallback(async () => {
    if (loaded) return;
    setFetchLoading(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/discord-channels`);
      const data = await res.json();
      setChannels(data.channels ?? []);
      setLoaded(true);
    } catch { /* silent */ }
    setFetchLoading(false);
  }, [guildId, loaded]);

  // Load channel names up-front so an already-configured channel shows by name.
  useEffect(() => { if (currentId && !loaded) load(); }, [currentId, loaded, load]);

  const openDropdown = () => { setOpen(true); load(); };

  const selectChannel = (id: string) => {
    // Send the ID as a STRING — a 19-digit snowflake as a JS number loses its
    // last digits past 2^53, which would corrupt the saved channel id.
    onPatch('log.log-channel', id, 'Warn-log channel');
    if (!activated) onPatch('log.Activated', true, 'Warn-log');
    setOpen(false);
    setSearch('');
  };

  const disable = () => {
    onPatch('log.log-channel', 0, 'Warn-log');
    onPatch('log.Activated', false, 'Warn-log');
    setOpen(false);
    setSearch('');
  };

  const q = search.toLowerCase();
  const available = channels
    .filter((c) => isTextChannel(c.type) && c.name.toLowerCase().includes(q))
    .sort((a, b) => a.position - b.position);

  const label = enabled ? (current ? `#${current.name}` : `#…${currentId.slice(-4)}`) : 'Disabled';

  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'visible' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>Warn-Log Channel</span>
      </div>
      <div style={{ padding: 18 }}>
      <p style={{ fontSize: 12, color: '#52535a', marginBottom: 12 }}>
        Send every warning, kick and ban to a channel — the same as <code style={{ color: '#949ba4', fontFamily: 'monospace' }}>/enable-warn-log</code> in Discord.
      </p>

      {/* Status + picker */}
      <div ref={ref} style={{ position: 'relative', maxWidth: 320 }}>
        <button onClick={openDropdown} disabled={isSaving}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', background: '#18181b', border: `1px solid ${open ? '#5865f2' : '#2e2e36'}`, borderRadius: 8, color: '#f2f3f5', fontSize: 13, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1, transition: 'border-color 0.15s', textAlign: 'left' }}>
          {isSaving
            ? <Loader2 size={14} color="#5865f2" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            : enabled
              ? <Hash size={14} color="#23a55a" style={{ flexShrink: 0 }} />
              : <XCircle size={14} color="#52535a" style={{ flexShrink: 0 }} />}
          <span style={{ flex: 1, fontWeight: 600, color: enabled ? '#f2f3f5' : '#6d6f78', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <ChevronDown size={14} color="#52535a" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            {/* Search */}
            <div style={{ padding: '8px 8px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#111113', border: '1px solid #2e2e36', borderRadius: 7 }}>
                {fetchLoading ? <Loader2 size={12} color="#52535a" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <Search size={12} color="#52535a" style={{ flexShrink: 0 }} />}
                <input ref={searchRef} type="text" placeholder="Search channels…" value={search} onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: '#f2f3f5', fontFamily: 'inherit' }} />
              </div>
            </div>

            <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0 8px' }}>
              {/* Disable option */}
              {enabled && (
                <button onClick={disable}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 14px', fontSize: 12, fontWeight: 500, color: '#f23f43', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#232329')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'none')}>
                  <XCircle size={13} style={{ flexShrink: 0 }} /> Disable warn-log
                </button>
              )}

              {available.length === 0
                ? <div style={{ padding: '10px 14px', fontSize: 12, color: '#52535a' }}>{fetchLoading ? 'Loading…' : 'No text channels found'}</div>
                : available.map((c) => {
                  const selected = c.id === currentId;
                  return (
                    <button key={c.id} onClick={() => selectChannel(c.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 14px', fontSize: 12, fontWeight: 500, color: selected ? '#f2f3f5' : '#b5bac1', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#232329')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'none')}>
                      {c.type === 5
                        ? <Megaphone size={13} color="#52535a" style={{ flexShrink: 0 }} />
                        : <span style={{ color: '#52535a', fontSize: 13, fontFamily: 'monospace', flexShrink: 0 }}>#</span>}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      {selected && <Check size={13} color="#23a55a" style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Per-category filter — only relevant once a log channel is active */}
      {enabled && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #1e1e22' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 4 }}>What appears in the log</div>
          <p style={{ fontSize: 11.5, color: '#52535a', marginBottom: 10 }}>Click to toggle — verifications are off by default so the log stays about threats.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {LOG_KINDS.map((k) => {
              const on = show?.[k.key] ?? k.defaultOn;
              const path = `log.show.${k.key}`;
              const busy = saving === path;
              return (
                <button key={k.key} onClick={() => onPatch(path, !on, `${k.label} logging`)} disabled={busy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s', opacity: busy ? 0.6 : 1,
                    background: on ? 'rgba(35,165,90,0.12)' : '#18181b',
                    color: on ? '#23a55a' : '#6d6f78',
                    border: `1px solid ${on ? 'rgba(35,165,90,0.35)' : '#2e2e36'}` }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? '#23a55a' : '#52535a' }} />
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily digest — only relevant once a log channel is active */}
      {enabled && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #1e1e22' }}>
          <ToggleSwitch
            checked={!!digest}
            onChange={(v) => onPatch('log.digest', v, 'Daily digest')}
            label="Daily digest"
            description="One summary embed per day instead of a message per action (Scam Shield, raid and lockdown alerts stay live)"
            disabled={saving === 'log.digest'}
          />
        </div>
      )}

      {/* Info */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: enabled ? 'rgba(35,165,90,0.06)' : 'rgba(148,155,164,0.05)', border: `1px solid ${enabled ? 'rgba(35,165,90,0.15)' : 'rgba(148,155,164,0.12)'}`, borderRadius: 8 }}>
        {enabled
          ? <Check size={13} color="#23a55a" style={{ flexShrink: 0, marginTop: 1 }} />
          : <XCircle size={13} color="#6d6f78" style={{ flexShrink: 0, marginTop: 1 }} />}
        <p style={{ fontSize: 12, color: '#6d6f78' }}>
          {enabled
            ? <>Moderation actions are logged to <strong style={{ color: '#949ba4' }}>{label}</strong>. Make sure the bot can send messages there.</>
            : 'No log channel set. Choose a channel above to start logging warnings, kicks and bans.'}
        </p>
      </div>
      </div>
    </div>
  );
}
