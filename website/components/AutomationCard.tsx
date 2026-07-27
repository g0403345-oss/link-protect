'use client';

/**
 * Automation (Premium) — night schedule (stricter blocking preset during set
 * hours) + event mode (block ALL links for 1–12 hours, for drops/giveaways).
 * Lives in the Blockers section, right below the platform blockers.
 */

import { useCallback, useEffect, useState } from 'react';
import { Moon, PartyPopper, RefreshCw, Save, TimerOff } from 'lucide-react';
import ToggleSwitch from '@/components/ToggleSwitch';
import PremiumLockNote from '@/components/PremiumLockNote';

interface Schedule {
  night: { enabled: boolean; fromHour: number; toHour: number; preset: 'strict' | 'balanced' };
  nightActive: boolean;
  eventUntil: number; // unix seconds, 0/past = off
  premium: boolean;
}

const EVENT_HOURS = [1, 2, 4, 6];
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function remaining(until: number): string {
  const s = until - Math.floor(Date.now() / 1000);
  if (s <= 0) return 'ending…';
  const h = Math.floor(s / 3600);
  const m = Math.ceil((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AutomationCard({ guildId, onToast, onNavigate }: {
  guildId: string;
  onToast: (type: 'success' | 'error', message: string) => void;
  onNavigate?: (section: string) => void;
}) {
  const [data, setData] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);

  /* night schedule drafts */
  const [enabled, setEnabled] = useState(false);
  const [fromHour, setFromHour] = useState(22);
  const [toHour, setToHour] = useState(7);
  const [preset, setPreset] = useState<'strict' | 'balanced'>('balanced');
  const [savingNight, setSavingNight] = useState(false);

  /* event mode */
  const [eventHours, setEventHours] = useState(2);
  const [eventBusy, setEventBusy] = useState(false);
  const [, setTick] = useState(0); // re-render for the countdown

  const load = useCallback(() => {
    fetch(`/api/guild/${guildId}/schedule`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.night) return;
        const s = d as Schedule;
        setData(s);
        setEnabled(!!s.night.enabled);
        setFromHour(s.night.fromHour ?? 22);
        setToHour(s.night.toHour ?? 7);
        setPreset(s.night.preset === 'strict' ? 'strict' : 'balanced');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

  // Tick the event-mode countdown once a minute while it's running.
  const eventActive = !!data && data.eventUntil > Math.floor(Date.now() / 1000);
  useEffect(() => {
    if (!eventActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [eventActive]);

  const nightDirty = !!data && (
    enabled !== !!data.night.enabled || fromHour !== data.night.fromHour
    || toHour !== data.night.toHour || preset !== data.night.preset
  );

  const saveNight = async () => {
    setSavingNight(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, fromHour, toHour, preset }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 403) { onToast('error', d.detail ?? 'Premium feature'); return; }
      if (!res.ok) { onToast('error', d.error ?? 'Could not save the schedule'); return; }
      onToast('success', 'Night schedule saved');
      load();
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setSavingNight(false); }
  };

  const startEvent = async () => {
    setEventBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/eventmode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: eventHours }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 403) { onToast('error', d.detail ?? 'Premium feature'); return; }
      if (!res.ok) { onToast('error', d.error ?? 'Could not start event mode'); return; }
      onToast('success', `Event mode on — all links blocked for ${eventHours}h`);
      setData((prev) => (prev ? { ...prev, eventUntil: d.until ?? 0 } : prev));
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setEventBusy(false); }
  };

  const endEvent = async () => {
    setEventBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/eventmode`, { method: 'DELETE' });
      if (!res.ok) { onToast('error', 'Could not end event mode'); return; }
      onToast('success', 'Event mode ended');
      setData((prev) => (prev ? { ...prev, eventUntil: 0 } : prev));
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setEventBusy(false); }
  };

  const select = { padding: '8px 28px 8px 10px', fontSize: 13, background: "#18181b url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236d6f78' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\") no-repeat right 10px center", border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' } as const;

  if (loading) return <p style={{ fontSize: 13, color: '#52535a' }}>Loading…</p>;

  if (data && !data.premium) {
    return <PremiumLockNote text="Night schedule & event mode — automate your blockers, a Premium extra. Protection itself stays free." onNavigate={onNavigate} />;
  }

  return (
    <div>
      {/* Night schedule */}
      <ToggleSwitch
        checked={enabled}
        onChange={setEnabled}
        label="Night schedule"
        description="Switch to a stricter blocker preset while your mods sleep — and back in the morning, automatically."
      />
      {data?.nightActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '8px 12px', background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.25)', borderRadius: 8 }}>
          <Moon size={13} color="#96a4ff" />
          <span style={{ fontSize: 12, color: '#96a4ff', fontWeight: 600 }}>Night preset active right now</span>
        </div>
      )}
      {enabled && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e1e22', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>From</label>
            <select value={fromHour} onChange={(e) => setFromHour(parseInt(e.target.value))} style={select}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Until</label>
            <select value={toHour} onChange={(e) => setToHour(parseInt(e.target.value))} style={select}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Night preset</label>
            <div style={{ display: 'inline-flex', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: 3, gap: 2 }}>
              {(['balanced', 'strict'] as const).map((p) => (
                <button key={p} onClick={() => setPreset(p)}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer', background: preset === p ? 'rgba(88,101,242,0.26)' : 'transparent', color: preset === p ? '#96a4ff' : '#6d6f78', transition: 'all 0.12s', textTransform: 'capitalize' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {nightDirty && (
        <button onClick={saveNight} disabled={savingNight}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: savingNight ? 0.5 : 1 }}>
          {savingNight ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Save schedule
        </button>
      )}

      {/* Event mode */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e1e22' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <PartyPopper size={14} color="#f0b232" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>Event mode</span>
        </div>
        {eventActive && data ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: '#f0b232', fontWeight: 600 }}>
              All links blocked — ends in {remaining(data.eventUntil)}
            </span>
            <button onClick={endEvent} disabled={eventBusy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: '#f23f43', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.3)', borderRadius: 8, cursor: 'pointer', opacity: eventBusy ? 0.6 : 1 }}>
              <TimerOff size={13} /> End now
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>
              Blocks ALL links until the timer ends — perfect for drops &amp; giveaways.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={eventHours} onChange={(e) => setEventHours(parseInt(e.target.value))} style={select}>
                {EVENT_HOURS.map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
              </select>
              <button onClick={startEvent} disabled={eventBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: eventBusy ? 0.6 : 1 }}>
                {eventBusy ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <PartyPopper size={13} />}
                Start event mode
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
