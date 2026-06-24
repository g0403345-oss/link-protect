'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Shield, ArrowRight, Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { BOT_INVITE, SUPPORT_SERVER } from '@/lib/discord';

/* ── Discord window mockup ───────────────────────────────────── */
function DiscordMockup() {
  const [phase, setPhase] = useState<'idle' | 'typing' | 'blocked'>('idle');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('typing'), 900);
    const t2 = setTimeout(() => setPhase('blocked'), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: 520, borderRadius: 12, overflow: 'hidden', border: '1px solid #2e2e36', background: '#1e1f22', boxShadow: '0 32px 80px rgba(0,0,0,0.55)', userSelect: 'none' }}>
      {/* title bar */}
      <div style={{ background: '#111214', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #2e2e36' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#f23f43', '#f0b232', '#23a55a'].map((c) => <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}
        </div>
        <span style={{ fontSize: 12, color: '#52535a', marginLeft: 6 }}>Discord</span>
      </div>

      <div style={{ display: 'flex', height: 340 }}>
        {/* server icons */}
        <div className="discord-sidebar" style={{ width: 56, background: '#1a1b1e', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 8, borderRight: '1px solid #2e2e36', flexShrink: 0 }}>
          {[{ bg: '#5865f2', label: 'LP', active: true }, { bg: '#23a55a', label: 'G', active: false }, { bg: '#f23f43', label: 'R', active: false }, { bg: '#f0b232', label: 'Y', active: false }].map(({ bg, label, active }, i) => (
            <div key={i} style={{ width: 36, height: 36, borderRadius: active ? 10 : '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0, outline: active ? '2px solid #5865f2' : 'none', outlineOffset: 2 }}>{label}</div>
          ))}
        </div>

        {/* channel list */}
        <div className="discord-channels" style={{ width: 152, background: '#2b2d31', padding: '12px 0', borderRight: '1px solid #2e2e36', flexShrink: 0 }}>
          <div style={{ padding: '4px 12px 8px', fontSize: 11, fontWeight: 700, color: '#6d6f78', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Text Channels</div>
          {['# general', '# rules', '# off-topic', '# bot-cmds'].map((ch, i) => (
            <div key={ch} style={{ padding: '5px 12px', fontSize: 13, color: i === 0 ? '#f2f3f5' : '#6d6f78', background: i === 0 ? 'rgba(88,101,242,0.15)' : 'transparent', borderLeft: i === 0 ? '2px solid #5865f2' : '2px solid transparent' }}>{ch}</div>
          ))}
        </div>

        {/* chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #2e2e36', fontSize: 13, fontWeight: 600, color: '#f2f3f5', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#52535a' }}>#</span> general
          </div>
          <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
            {/* normal message */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f0b232', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#111' }}>J</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f0b232' }}>Jake</span>
                  <span style={{ fontSize: 10, color: '#52535a' }}>Today 14:22</span>
                </div>
                <span style={{ fontSize: 13, color: '#dbdee1' }}>yo check this out lol</span>
              </div>
            </div>
            {/* phishing link */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f0b232', flexShrink: 0 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f0b232' }}>Jake</span>
                  <span style={{ fontSize: 10, color: '#52535a' }}>Today 14:22</span>
                </div>
                <span style={{ fontSize: 13, color: '#5865f2', background: 'rgba(88,101,242,0.08)', padding: '1px 4px', borderRadius: 3, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>discord.gift/free-nitro-xyz</span>
              </div>
            </div>
            {/* bot response */}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: phase === 'blocked' ? 1 : 0, y: phase === 'blocked' ? 0 : 6 }} transition={{ duration: 0.3 }} style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#5865f2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={14} color="#fff" strokeWidth={2.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#5865f2' }}>LinkProtect</span>
                  <span style={{ fontSize: 10, color: '#52535a' }}>Today 14:22</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#5865f2', background: 'rgba(88,101,242,0.15)', padding: '1px 5px', borderRadius: 3 }}>BOT</span>
                </div>
                <div style={{ borderLeft: '3px solid #f23f43', background: '#2b2d31', borderRadius: '0 6px 6px 0', padding: '8px 10px', fontSize: 12, maxWidth: 210 }}>
                  <div style={{ fontWeight: 700, color: '#f23f43', marginBottom: 3 }}>🚫 Nitro Scam blocked</div>
                  <div style={{ color: '#949ba4' }}>Jake — Warning 1/5</div>
                  <div style={{ color: '#52535a', marginTop: 2 }}>Message deleted automatically.</div>
                </div>
              </div>
            </motion.div>
            {/* typing */}
            {phase === 'typing' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 11, color: '#6d6f78', paddingLeft: 40 }}>
                LinkProtect is scanning...
              </motion.div>
            )}
          </div>
          <div style={{ margin: '0 12px 12px', padding: '8px 12px', background: '#383a40', borderRadius: 8, fontSize: 13, color: '#52535a' }}>Message #general</div>
        </div>
      </div>
    </div>
  );
}

/* ── Live stats (polls /api/stats) ───────────────────────────── */
interface LiveStatsData {
  servers: number; watchedUsers: number; warned: number; kicked: number; banned: number; timeouts: number;
}

function fmtStat(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  return n.toLocaleString('en-US');
}

function LiveNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current, to = value, dur = 900;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * ease));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    prev.current = value;
  }, [value]);
  return <>{fmtStat(display)}</>;
}

function LiveStats() {
  const [s, setS] = useState<LiveStatsData | null>(null);
  useEffect(() => {
    let on = true;
    const load = () =>
      fetch('/api/stats').then((r) => r.json()).then((d) => { if (on && !d.error) setS(d); }).catch(() => {});
    load();
    const id = setInterval(load, 10000); // live: refresh every 10s
    return () => { on = false; clearInterval(id); };
  }, []);

  const items = [
    { key: 'servers', value: s?.servers ?? 0, label: 'Active servers', color: '#5865f2', suffix: '+', live: true },
    { key: 'watched', value: s?.watchedUsers ?? 0, label: 'Users protected', color: '#23a55a', suffix: '' },
    { key: 'warned', value: s?.warned ?? 0, label: 'Warnings issued', color: '#f0b232', suffix: '' },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '36px 56px', maxWidth: 960, margin: '0 auto' }}>
      <style>{`@keyframes lpPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      {items.map((it) => (
        <div key={it.key} style={{ textAlign: 'center', minWidth: 110 }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: it.color, letterSpacing: '-0.04em', lineHeight: 1 }}>
            <LiveNumber value={it.value} />{it.suffix}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            {it.live && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#23a55a', animation: 'lpPulse 1.6s ease-in-out infinite' }} />}
            <span style={{ fontSize: 13, color: '#52535a', fontWeight: 500 }}>{it.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Feature row ──────────────────────────────────────────────── */
function Feature({ badge, title, description, bullets, visual, flip = false }: {
  badge: string; title: string; description: string; bullets: string[]; visual: React.ReactNode; flip?: boolean;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className="feature-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', direction: flip ? 'rtl' : 'ltr' }}>
      <div style={{ direction: 'ltr' }}>
        <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#5865f2', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.22)', borderRadius: 99, padding: '3px 10px', marginBottom: 16, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{badge}</div>
        <h3 style={{ fontSize: 32, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 12 }}>{title}</h3>
        <p style={{ fontSize: 16, color: '#6d6f78', lineHeight: 1.65, marginBottom: 20 }}>{description}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bullets.map((b) => (
            <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(35,165,90,0.12)', border: '1px solid rgba(35,165,90,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Check size={10} color="#23a55a" strokeWidth={3} />
              </div>
              <span style={{ fontSize: 14, color: '#949ba4', lineHeight: 1.5 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ direction: 'ltr' }}>{visual}</div>
    </motion.div>
  );
}

/* ── Warning flow visual ─────────────────────────────────────── */
/* ── Interactive: click a link, watch it get scanned ─────────── */
function LinkScannerVisual() {
  const samples = [
    { label: 'Nitro scam', text: 'discord.gift/free-nitro-x9f2', bad: true, verdict: 'Nitro scam blocked' },
    { label: 'Phishing',   text: 'grabify.link/r/track9b',       bad: true, verdict: 'IP grabber / phishing blocked' },
    { label: 'Invite',     text: 'discord.gg/random-server',     bad: true, verdict: 'Discord invite blocked' },
    { label: 'Safe link',  text: 'github.com/your/project',      bad: false, verdict: 'Allowed — clean link' },
  ];
  const [sel, setSel] = useState(0);
  const [scanning, setScanning] = useState(false);
  const s = samples[sel];
  const pick = (i: number) => { setSel(i); setScanning(true); window.setTimeout(() => setScanning(false), 700); };

  return (
    <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Try the scanner — tap a link</div>

      {/* message bubble */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#f0b232', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#111' }}>J</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f0b232', marginBottom: 2 }}>Jake</div>
          <span style={{ fontSize: 13, color: '#5865f2', background: 'rgba(88,101,242,0.08)', padding: '2px 5px', borderRadius: 3, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>{s.text}</span>
        </div>
      </div>

      {/* link picker chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {samples.map((x, i) => (
          <button key={x.label} onClick={() => pick(i)}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
              border: `1px solid ${sel === i ? '#5865f2' : '#2e2e36'}`,
              background: sel === i ? 'rgba(88,101,242,0.15)' : 'transparent',
              color: sel === i ? '#7289da' : '#949ba4' }}>
            {x.label}
          </button>
        ))}
      </div>

      {/* verdict */}
      <motion.div key={`${sel}-${scanning}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #2e2e36' }}>
        {scanning ? (
          <div style={{ padding: '10px 12px', background: '#1e1f22', fontSize: 12, color: '#6d6f78' }}>🔎 LinkProtect is scanning…</div>
        ) : s.bad ? (
          <div style={{ padding: '10px 12px', background: '#1e1f22', borderLeft: '3px solid #f23f43' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f23f43', marginBottom: 2 }}>🚫 {s.verdict}</div>
            <div style={{ fontSize: 12, color: '#949ba4' }}>Message deleted · Jake — Warning 1/5</div>
          </div>
        ) : (
          <div style={{ padding: '10px 12px', background: '#1e1f22', borderLeft: '3px solid #23a55a' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#23a55a', marginBottom: 2 }}>✓ {s.verdict}</div>
            <div style={{ fontSize: 12, color: '#949ba4' }}>No action taken.</div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ── Interactive: warning escalation simulator ───────────────── */
function WarnSimulator() {
  const [w, setW] = useState(1);
  const action =
    w >= 10 ? { label: 'Permanent ban', color: '#f23f43', icon: '🔨' } :
    w >= 5  ? { label: 'Auto-kick',     color: '#f23f43', icon: '👢' } :
    w >= 3  ? { label: 'Timeout',       color: '#f0b232', icon: '⏳' } :
              { label: 'Warning only',  color: '#f0b232', icon: '⚠️' };
  const nextAt = w >= 10 ? null : w >= 5 ? 10 : w >= 3 ? 5 : 3;
  const pct = nextAt ? Math.min(100, (w / nextAt) * 100) : 100;

  return (
    <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Warning simulator</div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#f2f3f5', lineHeight: 1, letterSpacing: '-0.04em' }}>{w}</div>
          <div style={{ fontSize: 12, color: '#52535a', marginTop: 4 }}>warning{w === 1 ? '' : 's'}</div>
        </div>
        <motion.div key={action.label} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: action.color, background: `${action.color}1a`, border: `1px solid ${action.color}40`, padding: '6px 12px', borderRadius: 99 }}>
          <span>{action.icon}</span>{action.label}
        </motion.div>
      </div>

      <div>
        <div style={{ height: 6, background: '#2e2e36', borderRadius: 99, overflow: 'hidden' }}>
          <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} style={{ height: '100%', background: action.color, borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 11, color: '#52535a', marginTop: 6 }}>
          {nextAt ? `${nextAt - w} more → ${w >= 5 ? 'ban' : w >= 3 ? 'kick' : 'timeout'}` : 'Maximum penalty reached'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setW((v) => Math.min(12, v + 1))}
          style={{ flex: 1, padding: '9px 14px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          + Add warning
        </button>
        <button onClick={() => setW(1)}
          style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, background: 'transparent', color: '#949ba4', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
          Reset
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#3e3e4a' }}>Thresholds (your rules): timeout at 3 · kick at 5 · ban at 10</div>
    </div>
  );
}

/* ── Silent mode toggle visual ───────────────────────────────── */
function SilentModeVisual() {
  const [silent, setSilent] = useState(false);
  return (
    <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f2f3f5' }}>Silent Mode</div>
          <div style={{ fontSize: 12, color: '#52535a', marginTop: 2 }}>DM instead of channel message</div>
        </div>
        <button onClick={() => setSilent(!silent)} style={{ width: 44, height: 24, borderRadius: 99, background: silent ? '#23a55a' : '#2e2e36', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 3, left: silent ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
        </button>
      </div>
      <motion.div key={silent ? 'silent' : 'public'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #2e2e36', fontSize: 12 }}>
        {silent ? (
          <div style={{ padding: 12, background: '#1e1f22' }}>
            <div style={{ color: '#52535a', marginBottom: 8, fontWeight: 600 }}>📬 Private DM to user</div>
            <div style={{ background: '#2b2d31', borderLeft: '3px solid #5865f2', padding: '8px 10px', borderRadius: '0 4px 4px 0', color: '#949ba4' }}>
              ⚠️ Your message in <strong style={{ color: '#f2f3f5' }}>#general</strong> was removed (blocked link). Warning <strong style={{ color: '#f2f3f5' }}>1/5</strong>.
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, background: '#1e1f22' }}>
            <div style={{ color: '#52535a', marginBottom: 8, fontWeight: 600 }}>📢 Public channel message</div>
            <div style={{ background: '#2b2d31', borderLeft: '3px solid #f23f43', padding: '8px 10px', borderRadius: '0 4px 4px 0', color: '#949ba4' }}>
              🚫 <strong style={{ color: '#f23f43' }}>Link blocked</strong> · Jake — Nitro scam detected. Warning 1/5.
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ── Block type chips ─────────────────────────────────────────── */
const BLOCKERS = [
  { name: 'Nitro Scams', icon: '🎮' }, { name: 'Phishing Links', icon: '🎣' },
  { name: 'NSFW Sites', icon: '🔞' }, { name: 'Malware URLs', icon: '🦠' },
  { name: 'Discord Invites', icon: '📨' }, { name: 'YouTube Links', icon: '▶️' },
  { name: 'Twitch Streams', icon: '🟣' }, { name: 'Steam Links', icon: '🎮' },
  { name: 'Google Links', icon: '🔍' }, { name: 'URL Shorteners', icon: '🔗' },
  { name: 'GIF Links', icon: '🖼️' }, { name: 'Custom Blacklist', icon: '📋' },
  { name: 'Link-only channels', icon: '📌' }, { name: 'All external links', icon: '🌐' },
];

/* ── Main ─────────────────────────────────────────────────────── */
export default function LandingClient() {
  const statsRef = useRef(null);

  return (
    <div style={{ background: '#0e0e10', minHeight: '100vh', color: '#f2f3f5' }}>
      <Navbar />

      {/* HERO */}
      <section className="dot-grid" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '100px 24px 80px', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(88,101,242,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="hero-grid" style={{ maxWidth: 1120, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', position: 'relative' }}>
          <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            {/* badge */}
            <a href="https://discord.gg/BjDC9t329E" target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 99, padding: '5px 12px', textDecoration: 'none', marginBottom: 28 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#23a55a', flexShrink: 0 }} />
              v2.1.0 — Silent Mode is live
              <ArrowRight size={12} />
            </a>

            <h1 className="hero-title" style={{ fontSize: 72, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1.0, color: '#f2f3f5', marginBottom: 20 }}>
              Stop every<br /><span style={{ color: '#5865f2' }}>bad link.</span><br />Automatically.
            </h1>

            <p style={{ fontSize: 18, color: '#6d6f78', lineHeight: 1.6, maxWidth: 420, marginBottom: 32 }}>
              14 independent shields blocking phishing, NSFW, scams and custom domains — before they ever appear in your server.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href={BOT_INVITE} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#4752c4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#5865f2')}>
                Add to Discord — Free <ArrowRight size={15} />
              </a>
              <Link href="/dashboard"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600, color: '#949ba4', borderRadius: 10, textDecoration: 'none', border: '1px solid #2e2e36', transition: 'border-color 0.15s, color 0.15s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#52535a'; (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; (e.currentTarget as HTMLElement).style.color = '#949ba4'; }}>
                Dashboard
              </Link>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 36 }}>
              <div style={{ display: 'flex' }}>
                {['#f23f43', '#f0b232', '#23a55a', '#5865f2', '#9146ff'].map((c, i) => (
                  <div key={c} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: '2px solid #0e0e10', marginLeft: i ? -8 : 0 }} />
                ))}
              </div>
              <span style={{ fontSize: 13, color: '#52535a' }}>Trusted by <strong style={{ color: '#949ba4' }}>6,495+ servers</strong></span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} style={{ display: 'flex', justifyContent: 'center' }}>
            <DiscordMockup />
          </motion.div>
        </div>
      </section>

      {/* STATS (live) */}
      <section ref={statsRef} style={{ borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b', background: '#111113', padding: '52px 24px' }}>
        <LiveStats />
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: '100px 24px', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 96 }}>
          <Feature
            badge="Real-time detection"
            title="Catches threats the moment they're sent."
            description="Every message is scanned instantly. Malicious links are deleted before anyone can click them — no delay, no manual review."
            bullets={[
              'Google Safe Browsing for known malware & phishing',
              'Pattern-matching for Nitro scams and fake gift links',
              'Custom domain blacklist per server',
              'Zero false positives on normal messages',
            ]}
            visual={<LinkScannerVisual />}
          />

          <Feature
            badge="Warning system"
            title="Progressive punishment. Your rules."
            description="Repeated offenders get escalating consequences. You control every threshold directly from the dashboard."
            bullets={[
              'Configure kick and ban thresholds per server',
              'Adjustable timeout duration',
              'Per-user warning history with reasons logged',
              'One-click warning reset for individual users',
            ]}
            visual={<WarnSimulator />}
            flip
          />

          <Feature
            badge="Silent mode"
            title="Moderation without the noise."
            description="Don't want a public warning message cluttering your channel? Enable silent mode — links get deleted, users get a private DM."
            bullets={[
              'User receives a private DM explaining the removal',
              'No embed or message posted in the channel',
              'Toggle per-server from the dashboard',
              'Works across all 14 detection shields',
            ]}
            visual={<SilentModeVisual />}
          />
        </div>
      </section>

      {/* WHAT WE BLOCK */}
      <section id="blockers" style={{ padding: '80px 24px', background: '#111113', borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.035em', color: '#f2f3f5', marginBottom: 10 }}>14 shields. Every threat covered.</h2>
            <p style={{ fontSize: 15, color: '#52535a' }}>Toggle each protection on or off — per server, per channel.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
            {BLOCKERS.map(({ name, icon }) => (
              <div key={name}
                style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: '#6d6f78', transition: 'border-color 0.15s, color 0.15s', cursor: 'default' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#52535a'; e.currentTarget.style.color = '#f2f3f5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2e2e36'; e.currentTarget.style.color = '#6d6f78'; }}>
                <span style={{ fontSize: 16 }}>{icon}</span>{name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '96px 24px', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#23a55a', background: 'rgba(35,165,90,0.08)', border: '1px solid rgba(35,165,90,0.18)', borderRadius: 99, padding: '4px 12px', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#23a55a' }} /> Free forever
          </div>
          <h2 className="cta-title" style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 14, lineHeight: 1.05 }}>
            Your server deserves<br />real protection.
          </h2>
          <p style={{ fontSize: 16, color: '#52535a', marginBottom: 36, maxWidth: 400, margin: '0 auto 36px' }}>
            Add LinkProtect in 30 seconds. Works out of the box — no setup required.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={BOT_INVITE} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none', transition: 'background 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#4752c4')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#5865f2')}>
              Add to Discord — It&apos;s free <ArrowRight size={15} />
            </a>
            <a href={SUPPORT_SERVER} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', fontSize: 15, fontWeight: 600, color: '#949ba4', borderRadius: 10, textDecoration: 'none', border: '1px solid #2e2e36', transition: 'border-color 0.15s, color 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#52535a'; e.currentTarget.style.color = '#f2f3f5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2e2e36'; e.currentTarget.style.color = '#949ba4'; }}>
              <ExternalLink size={15} /> Join Support Server
            </a>
          </div>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #18181b', padding: '28px 24px', background: '#0e0e10' }}>
        <div className="footer-row" style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={12} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#52535a' }}>LinkProtect</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            {[{ label: 'Support', href: SUPPORT_SERVER }, { label: 'Invite', href: BOT_INVITE }, { label: 'Dashboard', href: '/dashboard' }].map(({ label, href }) => (
              <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}
                style={{ fontSize: 13, color: '#52535a', textDecoration: 'none', transition: 'color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#949ba4')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
                {label}
              </a>
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#2e2e36' }}>© 2026 LinkProtect · v2.1.0</span>
        </div>
      </footer>
    </div>
  );
}
