'use client';

/**
 * Blockers as a tile wall (redesign point 4) — the landing page's shield-wall
 * look inside the dashboard: grouped icon tiles that glow when active; a click
 * toggles the blocker. Replaces the plain toggle list.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Globe, Bug, Gift, Link2, EyeOff, Mail, Youtube, Search, Image as ImageIcon,
  Twitch, Gamepad2, Loader2, Check,
} from 'lucide-react';

interface Blocker { key: string; label: string; icon: LucideIcon; color: string; desc: string; }

const GROUPS: { title: string; items: Blocker[] }[] = [
  {
    title: 'Scams & threats',
    items: [
      { key: 'malware', label: 'Malware / Phishing', icon: Bug, color: '#f23f43', desc: 'Known malware and phishing URLs' },
      { key: 'nitro', label: 'Nitro Scams', icon: Gift, color: '#eb459e', desc: 'Fake "free Nitro" hijack links' },
      { key: 'bit', label: 'Shorteners', icon: Link2, color: '#f0b232', desc: 'bit.ly & co. hide real targets' },
      { key: 'nsfw', label: 'NSFW', icon: EyeOff, color: '#f23f43', desc: 'Known adult sites' },
    ],
  },
  {
    title: 'Platforms & content',
    items: [
      { key: 'invite', label: 'Invites', icon: Mail, color: '#5865f2', desc: 'discord.gg invite links' },
      { key: 'youtube', label: 'YouTube', icon: Youtube, color: '#f23f43', desc: 'youtube.com & youtu.be' },
      { key: 'google', label: 'Google', icon: Search, color: '#23a55a', desc: 'google.com links' },
      { key: 'gif', label: 'GIFs', icon: ImageIcon, color: '#f0b232', desc: 'tenor, giphy & co.' },
      { key: 'twitch', label: 'Twitch', icon: Twitch, color: '#9146ff', desc: 'twitch.tv links' },
      { key: 'steam', label: 'Steam', icon: Gamepad2, color: '#5865f2', desc: 'Steam store & community' },
    ],
  },
];

function Tile({ b, active, busy, onToggle }: { b: Blocker; active: boolean; busy: boolean; onToggle: () => void }) {
  const Icon = b.icon;
  return (
    <button onClick={onToggle} disabled={busy} title={`${b.desc} — click to turn ${active ? 'off' : 'on'}`}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
        padding: '13px 13px 11px', borderRadius: 12, cursor: busy ? 'wait' : 'pointer', textAlign: 'left',
        background: active ? `${b.color}0d` : '#111113',
        border: `1px solid ${active ? `${b.color}55` : '#1e1e22'}`,
        boxShadow: active ? `0 0 22px ${b.color}1a inset` : 'none',
        opacity: busy ? 0.6 : 1, transition: 'all 0.18s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.borderColor = active ? b.color : '#3e3e4a'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.borderColor = active ? `${b.color}55` : '#1e1e22'; }}>
      <span style={{ position: 'absolute', top: 10, right: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: active ? b.color : '#1e1e22', border: active ? 'none' : '1px solid #2e2e36' }}>
        {busy ? <Loader2 size={10} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : active ? <Check size={10} color="#fff" strokeWidth={3.5} /> : null}
      </span>
      <Icon size={19} color={active ? b.color : '#52535a'} style={{ transition: 'color 0.18s' }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#f2f3f5' : '#949ba4', lineHeight: 1.25 }}>{b.label}</span>
    </button>
  );
}

export default function BlockerWall({ protect, saving, onToggle }: {
  protect: Record<string, boolean | undefined>;
  saving: string | null;
  onToggle: (key: string, value: boolean, label: string) => void;
}) {
  const allOn = !!protect.all;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Master tile — full width, overrides everything else */}
      <button onClick={() => onToggle('all', !allOn, 'Block All Links')} disabled={saving === 'protect.all'}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
          cursor: saving === 'protect.all' ? 'wait' : 'pointer', textAlign: 'left',
          background: allOn ? 'rgba(242,63,67,0.07)' : '#111113',
          border: `1px solid ${allOn ? 'rgba(242,63,67,0.45)' : '#1e1e22'}`,
          transition: 'all 0.18s',
        }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 11, background: allOn ? 'rgba(242,63,67,0.14)' : '#18181b', flexShrink: 0 }}>
          <Globe size={18} color={allOn ? '#f23f43' : '#52535a'} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: allOn ? '#f2f3f5' : '#b5bac1' }}>Block All Links</span>
          <span style={{ display: 'block', fontSize: 12, color: '#6d6f78', marginTop: 2 }}>
            Every external link is removed — overrides the tiles below.
          </span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: allOn ? '#f23f43' : '#52535a', flexShrink: 0 }}>
          {saving === 'protect.all' ? '…' : allOn ? 'ON' : 'OFF'}
        </span>
      </button>

      {GROUPS.map((g) => (
        <div key={g.title} style={{ opacity: allOn ? 0.45 : 1, transition: 'opacity 0.2s', pointerEvents: allOn ? 'none' : 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#52535a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 9 }}>{g.title}</div>
          <div className="blocker-wall-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 8 }}>
            {g.items.map((b) => (
              <Tile key={b.key} b={b} active={!!protect[b.key]} busy={saving === `protect.${b.key}`}
                onToggle={() => onToggle(b.key, !protect[b.key], b.label)} />
            ))}
          </div>
        </div>
      ))}
      {allOn && (
        <p style={{ fontSize: 12, color: '#6d6f78', marginTop: -6 }}>
          Individual blockers are inactive while <b style={{ color: '#f23f43' }}>Block All Links</b> is on.
        </p>
      )}
    </div>
  );
}
