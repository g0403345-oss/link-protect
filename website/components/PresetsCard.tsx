'use client';

import { useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert, RefreshCw, Check } from 'lucide-react';
import CollapsibleCard from '@/components/CollapsibleCard';

// Mirrors the bot's /setup-preset and the iOS app's Quick Setup: one click sets
// all security-relevant toggles. Taste blockers (YouTube, GIFs …) are never
// touched by a preset.
const PRESETS = [
  {
    id: 'minimal', label: 'Minimal', icon: Shield, color: '#23a55a',
    blurb: 'Just the essentials — malware, phishing, nitro scams, dangerous files and hijacked webhooks.',
    values: {
      'protect.malware': true, 'protect.nitro': true, 'protect.bit': false,
      'protect.nsfw': false, 'protect.invite': false,
      'protect.files': true, 'protect.webhook': true, 'protect.mentions': false,
      'raid.enabled': false, 'scamguard.enabled': false, 'scamguard.join_check': false,
    },
  },
  {
    id: 'balanced', label: 'Balanced', icon: ShieldCheck, color: '#5865f2', recommended: true,
    blurb: 'Recommended — threat blockers plus raid protection and Scam Shield.',
    values: {
      'protect.malware': true, 'protect.nitro': true, 'protect.bit': true,
      'protect.nsfw': true, 'protect.invite': false,
      'protect.files': true, 'protect.webhook': true, 'protect.mentions': false,
      'raid.enabled': true, 'scamguard.enabled': true, 'scamguard.join_check': false,
    },
  },
  {
    id: 'strict', label: 'Strict', icon: ShieldAlert, color: '#f23f43',
    blurb: 'Maximum protection — adds invite blocking, mention-spam defense and the known-scammer join check.',
    values: {
      'protect.malware': true, 'protect.nitro': true, 'protect.bit': true,
      'protect.nsfw': true, 'protect.invite': true,
      'protect.files': true, 'protect.webhook': true, 'protect.mentions': true,
      'raid.enabled': true, 'scamguard.enabled': true, 'scamguard.join_check': true,
    },
  },
] as const;

export default function PresetsCard({ guildId, onToast, onApplied }: {
  guildId: string;
  onToast: (type: 'success' | 'error', message: string) => void;
  onApplied: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const apply = async (preset: (typeof PRESETS)[number]) => {
    if (confirm !== preset.id) {
      setConfirm(preset.id);
      setTimeout(() => setConfirm((c) => (c === preset.id ? null : c)), 3500);
      return;
    }
    setConfirm(null);
    setBusy(preset.id);
    try {
      // Sequential on purpose: the settings PATCH does read-modify-write on one
      // JSON document — parallel writes would clobber each other.
      for (const [path, value] of Object.entries(preset.values)) {
        const res = await fetch(`/api/guild/${guildId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, value }),
        });
        if (!res.ok) throw new Error(path);
      }
      onToast('success', `${preset.label} preset applied`);
      onApplied();
    } catch {
      onToast('error', 'Could not apply the preset completely — check your settings.');
      onApplied();
    } finally {
      setBusy(null);
    }
  };

  return (
    <CollapsibleCard title="Quick Setup" storageKey="guild_quick-setup">
      <div>
        <p style={{ fontSize: 12, color: '#52535a', marginBottom: 14 }}>
          One click sets every security toggle to a sensible level — same presets as the iOS app
          and <code style={{ fontFamily: 'monospace', color: '#949ba4' }}>/setup-preset</code>.
          Your YouTube/GIF-style preference blockers stay untouched.
        </p>
        <div className="stats-3col-dashboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {PRESETS.map((p) => {
            const confirming = confirm === p.id;
            const isBusy = busy === p.id;
            return (
              <button key={p.id} onClick={() => apply(p)} disabled={busy !== null}
                style={{ position: 'relative', textAlign: 'left', padding: '14px 14px 12px', background: confirming ? `${p.color}14` : '#18181b', border: `1px solid ${confirming ? p.color : '#2e2e36'}`, borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', opacity: busy && !isBusy ? 0.5 : 1 }}
                onMouseEnter={(e) => { if (!confirming) (e.currentTarget as HTMLElement).style.borderColor = p.color; }}
                onMouseLeave={(e) => { if (!confirming) (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; }}>
                {'recommended' in p && p.recommended && (
                  <span style={{ position: 'absolute', top: -8, right: 10, fontSize: 9, fontWeight: 800, color: '#fff', background: '#5865f2', padding: '2px 8px', borderRadius: 99, letterSpacing: '0.05em' }}>
                    RECOMMENDED
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `${p.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isBusy ? <RefreshCw size={14} style={{ color: p.color, animation: 'spin 1s linear infinite' }} />
                      : confirming ? <Check size={14} style={{ color: p.color }} />
                      : <p.icon size={14} style={{ color: p.color }} />}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: confirming ? p.color : '#f2f3f5' }}>
                    {isBusy ? 'Applying…' : confirming ? 'Confirm?' : p.label}
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: '#6d6f78', lineHeight: 1.5 }}>{p.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>
    </CollapsibleCard>
  );
}
