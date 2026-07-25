'use client';

/**
 * Setup progress card (redesign point 8): "4/6 set up" with one-click jumps to
 * the right tab. Auto-hides once everything is done (with a small celebration)
 * or when dismissed; remembers both per server in localStorage.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ArrowRight, X, Rocket } from 'lucide-react';
import { Celebration } from '@/components/fx';
import type { ServerData } from '@/lib/db';

export default function SetupChecklist({ guildId, data, onNavigate }: {
  guildId: string;
  data: ServerData;
  onNavigate: (section: string) => void;
}) {
  const items = useMemo(() => {
    const protectOn = Object.values(data.protect ?? {}).filter(Boolean).length;
    const warn = data.warn ?? ({} as NonNullable<ServerData['warn']>);
    return [
      { key: 'log', label: 'Set a log channel', done: !!data.log?.Activated && !!data.log?.['log-channel'], section: 'log' },
      { key: 'blockers', label: 'Turn on 3+ blockers (or a preset)', done: protectOn >= 3, section: 'blockers' },
      { key: 'thresholds', label: 'Set warning thresholds', done: (warn.kick ?? 0) > 0 || (warn.ban ?? 0) > 0 || (warn.timeout?.warnings ?? 0) > 0, section: 'warnings' },
      { key: 'scamshield', label: 'Enable Scam Shield', done: !!data.scamguard?.enabled, section: 'scamshield' },
      { key: 'raid', label: 'Enable raid protection', done: !!data.raid?.enabled, section: 'blockers' },
      { key: 'verify', label: 'Set up the verification gate', done: !!data.verify?.enabled, section: 'verification' },
    ];
  }, [data]);

  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;
  const storageKey = `lp_setup_done_${guildId}`;

  const [dismissed, setDismissed] = useState(true); // start hidden to avoid a flash
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    try { setDismissed(!!localStorage.getItem(storageKey)); } catch { setDismissed(false); }
  }, [storageKey]);

  // Completing the list celebrates once, then the card retires itself.
  useEffect(() => {
    if (!complete || dismissed) return;
    try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
    setCelebrate(true);
  }, [complete, dismissed, storageKey]);

  if (dismissed && !celebrate) return null;
  if (complete && !celebrate) return null;

  return (
    <>
      <Celebration fire={celebrate} onDone={() => { setCelebrate(false); setDismissed(true); }} />
      {!dismissed && !complete && (
        <div style={{ padding: '16px 18px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(88,101,242,0.08), rgba(88,101,242,0.02))', border: '1px solid rgba(88,101,242,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Rocket size={16} color="#96a4ff" />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#f2f3f5' }}>Finish your setup</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#96a4ff' }}>{done}/{items.length}</span>
            <div style={{ flex: 1, height: 5, borderRadius: 99, background: '#1e1e22', overflow: 'hidden', minWidth: 60 }}>
              <div style={{ width: `${(done / items.length) * 100}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #5865f2, #96a4ff)', transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)' }} />
            </div>
            <button onClick={() => { setDismissed(true); try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ } }}
              title="Hide this checklist" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', display: 'flex', padding: 2 }}>
              <X size={14} />
            </button>
          </div>
          <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
            {items.map((i) => (
              <button key={i.key} onClick={() => !i.done && onNavigate(i.section)} disabled={i.done}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: 'none', cursor: i.done ? 'default' : 'pointer', background: i.done ? 'transparent' : 'rgba(255,255,255,0.03)', textAlign: 'left', transition: 'background 0.13s' }}
                onMouseEnter={(e) => { if (!i.done) (e.currentTarget as HTMLElement).style.background = 'rgba(88,101,242,0.1)'; }}
                onMouseLeave={(e) => { if (!i.done) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}>
                {i.done
                  ? <CheckCircle2 size={14} color="#23a55a" style={{ flexShrink: 0 }} />
                  : <Circle size={14} color="#52535a" style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: i.done ? '#52535a' : '#dbdee1', textDecoration: i.done ? 'line-through' : 'none' }}>
                  {i.label}
                </span>
                {!i.done && <ArrowRight size={12} color="#96a4ff" style={{ flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
