'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, ArrowRight, Check, ExternalLink, Smartphone, Bell, Lock,
  Gift, Fish, EyeOff, Bug, Mail, Youtube, Twitch, Gamepad2, Search, Link2,
  Image as ImageIcon, ClipboardList, Pin, Globe, ShieldAlert, Siren, type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import LinkChecker from '@/components/LinkChecker';
import Leaderboard from '@/components/Leaderboard';
import SupporterWall from '@/components/SupporterWall';

/* ── "Now on iOS" app showcase ───────────────────────────────── */
function PhoneShot({ src, alt, raised }: { src: string; alt: string; raised?: boolean }) {
  return (
    <div style={{ flex: '0 0 auto', width: 'min(236px, 72vw)', transform: raised ? 'translateY(-22px)' : 'none' }}>
      <div style={{ borderRadius: 36, overflow: 'hidden', border: '1px solid #2e2e36', background: '#000', boxShadow: '0 30px 70px rgba(0,0,0,0.55)', lineHeight: 0 }}>
        <Image src={src} alt={alt} width={1206} height={2622} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </div>
    </div>
  );
}

function AppSection() {
  const features = [
    { icon: Smartphone, title: 'Full control on mobile', desc: 'Toggle all 16 shields, apply presets, set warning thresholds and blacklists — right from your phone.' },
    { icon: Bell, title: 'Instant push alerts', desc: 'Know the moment the bot goes offline or a protection rule fires in one of your servers.' },
    { icon: Lock, title: 'Face ID locked', desc: 'Your moderation panel stays private behind Face ID — plus a Home Screen widget for live status.' },
  ];
  return (
    <section style={{ padding: '100px 24px', borderTop: '1px solid #18181b', background: '#0b0b0d' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#7289da', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 99, padding: '4px 12px', marginBottom: 22, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Smartphone size={12} /> Now on iOS
          </div>
          <h2 className="cta-title" style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 16, lineHeight: 1.05 }}>
            Your whole server,<br />in your pocket.
          </h2>
          <p style={{ fontSize: 17, color: '#6d6f78', maxWidth: 440, margin: '0 auto 30px', lineHeight: 1.6 }}>
            Manage protection, watch live activity and get push alerts — anywhere. Free, sign in with Discord, no extra account.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}><AppStoreBadge /></div>
        </div>

        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <PhoneShot src="/app/servers.png" alt="Server list in the Link Protect iOS app" />
          <PhoneShot src="/app/overview.png" alt="Server protection overview in the Link Protect iOS app" raised />
          <PhoneShot src="/app/blockers.png" alt="Link blockers configuration in the Link Protect iOS app" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 64 }}>
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 12, padding: 22 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(88,101,242,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Icon size={17} color="#7289da" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5', marginBottom: 6 }}>{title}</div>
              <p style={{ fontSize: 13.5, color: '#6d6f78', lineHeight: 1.55 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
import Navbar from '@/components/Navbar';
import { BOT_INVITE, SUPPORT_SERVER, APP_STORE_URL } from '@/lib/discord';

/* ── "Download on the App Store" badge ───────────────────────── */
function AppStoreBadge() {
  return (
    <a href={APP_STORE_URL} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: '#000', border: '1px solid #2e2e36', borderRadius: 12, textDecoration: 'none', transition: 'border-color 0.15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#52535a')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}>
      <svg width="22" height="22" viewBox="0 0 384 512" fill="#fff" aria-hidden="true">
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 10, color: '#b5bac1', fontWeight: 500 }}>Download on the</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>App Store</span>
      </span>
    </a>
  );
}

/* ── Discord window mockup — loops through real threat stories ── */
const MOCK_SCENES = [
  {
    user: 'Jake', avatarBg: '#f0b232', avatarFg: '#111', initial: 'J',
    pre: 'yo check this out lol',
    link: 'discord.gift/free-nitro-xyz',
    verdict: '🚫 Nitro Scam blocked', sub: 'Jake — Warning 1/5',
    extra: 'Message deleted automatically.',
  },
  {
    user: 'Mia', avatarBg: '#eb459e', avatarFg: '#fff', initial: 'M',
    pre: 'is this trade site legit??',
    link: 'steamcommunlty.ru/trade/offer',
    verdict: '🎣 Phishing blocked', sub: 'Look-alike domain detected',
    extra: 'steamcommunlty ≠ steamcommunity — deleted.',
  },
  {
    user: 'Scammer', avatarBg: '#f23f43', avatarFg: '#fff', initial: 'S',
    pre: '🎁 $5,600 giveaway for everyone!!',
    link: 'gozawin.com/claim-now',
    verdict: '🛡️ Scam Shield triggered', sub: 'Same spam in 3 channels',
    extra: 'All copies deleted · account banned.',
  },
];

function DiscordMockup() {
  const [scene, setScene] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'typing' | 'blocked'>('idle');
  useEffect(() => {
    // Each scene: message sits → bot "scans" → block embed → next story.
    const t1 = setTimeout(() => setPhase('typing'), 900);
    const t2 = setTimeout(() => setPhase('blocked'), 2100);
    const t3 = setTimeout(() => { setPhase('idle'); setScene((s) => (s + 1) % MOCK_SCENES.length); }, 5600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [scene]);
  const sc = MOCK_SCENES[scene];

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
            <motion.div key={`pre-${scene}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: sc.avatarBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sc.avatarFg }}>{sc.initial}</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: sc.avatarBg }}>{sc.user}</span>
                  <span style={{ fontSize: 10, color: '#52535a' }}>Today 14:22</span>
                </div>
                <span style={{ fontSize: 13, color: '#dbdee1' }}>{sc.pre}</span>
              </div>
            </motion.div>
            {/* the malicious link */}
            <motion.div key={`link-${scene}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }} style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: sc.avatarBg, flexShrink: 0 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: sc.avatarBg }}>{sc.user}</span>
                  <span style={{ fontSize: 10, color: '#52535a' }}>Today 14:22</span>
                </div>
                <span style={{ fontSize: 13, color: '#5865f2', background: 'rgba(88,101,242,0.08)', padding: '1px 4px', borderRadius: 3, textDecoration: phase === 'blocked' ? 'line-through' : 'underline', textDecorationStyle: phase === 'blocked' ? 'solid' : 'dotted', opacity: phase === 'blocked' ? 0.45 : 1, transition: 'opacity 0.3s' }}>{sc.link}</span>
              </div>
            </motion.div>
            {/* bot response */}
            <motion.div key={`bot-${scene}`} initial={false} animate={{ opacity: phase === 'blocked' ? 1 : 0, y: phase === 'blocked' ? 0 : 6 }} transition={{ duration: 0.3 }} style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#5865f2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={14} color="#fff" strokeWidth={2.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#5865f2' }}>Link Protect</span>
                  <span style={{ fontSize: 10, color: '#52535a' }}>Today 14:22</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#5865f2', background: 'rgba(88,101,242,0.15)', padding: '1px 5px', borderRadius: 3 }}>BOT</span>
                </div>
                <div style={{ borderLeft: '3px solid #f23f43', background: '#2b2d31', borderRadius: '0 6px 6px 0', padding: '8px 10px', fontSize: 12, maxWidth: 230 }}>
                  <div style={{ fontWeight: 700, color: '#f23f43', marginBottom: 3 }}>{sc.verdict}</div>
                  <div style={{ color: '#949ba4' }}>{sc.sub}</div>
                  <div style={{ color: '#52535a', marginTop: 2 }}>{sc.extra}</div>
                </div>
              </div>
            </motion.div>
            {/* typing */}
            {phase === 'typing' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 11, color: '#6d6f78', paddingLeft: 40 }}>
                Link Protect is scanning...
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

/* ── Bento feature card ───────────────────────────────────────── */
function BentoCard({ span, badge, title, description, bullets, visual, row = false }: {
  span: number; badge: string; title: string; description: string;
  bullets?: string[]; visual: React.ReactNode; row?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="bento-card noise"
      style={{ gridColumn: `span ${span}`, position: 'relative', background: '#111113', border: '1px solid #1e1e22', borderRadius: 18, padding: 26, display: 'flex', flexDirection: row ? 'row' : 'column', gap: 24, alignItems: row ? 'center' : 'stretch', overflow: 'hidden', transition: 'border-color 0.2s, box-shadow 0.2s' }}
      onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(88,101,242,0.45)'; el.style.boxShadow = '0 14px 44px rgba(88,101,242,0.10)'; }}
      onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#1e1e22'; el.style.boxShadow = 'none'; }}>
      <div style={{ flex: row ? '1 1 0' : 'none', minWidth: 0 }}>
        <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#5865f2', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.22)', borderRadius: 99, padding: '3px 10px', marginBottom: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{badge}</div>
        <h3 style={{ fontSize: row ? 28 : 22, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 10 }}>{title}</h3>
        <p style={{ fontSize: 14.5, color: '#6d6f78', lineHeight: 1.6, marginBottom: bullets?.length ? 16 : 0 }}>{description}</p>
        {bullets && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {bullets.map((b) => (
              <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <div style={{ width: 17, height: 17, borderRadius: '50%', background: 'rgba(35,165,90,0.12)', border: '1px solid rgba(35,165,90,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Check size={9} color="#23a55a" strokeWidth={3} />
                </div>
                <span style={{ fontSize: 13.5, color: '#949ba4', lineHeight: 1.5 }}>{b}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: row ? '1 1 0' : 'none', minWidth: 0 }}>{visual}</div>
    </motion.div>
  );
}

/* ── Shield wall tile (3D tilt + cursor glow) ─────────────────── */
function ShieldTile({ name, icon: Icon }: { name: string; icon: LucideIcon }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(520px) rotateY(${(px * 14).toFixed(1)}deg) rotateX(${(-py * 14).toFixed(1)}deg) translateY(-2px)`;
    el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(0)}%`);
    el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(0)}%`);
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = 'none'; };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className="lp-shield"
      style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 12, padding: '16px 10px 13px', textAlign: 'center', transition: 'transform 0.15s ease-out, border-color 0.2s', willChange: 'transform', position: 'relative', overflow: 'hidden', cursor: 'default' }}>
      <div aria-hidden className="lp-shield-glow" />
      <div style={{ width: 42, height: 46, margin: '0 auto', clipPath: 'polygon(50% 0%, 100% 14%, 100% 54%, 50% 100%, 0% 54%, 0% 14%)', background: 'linear-gradient(180deg, rgba(88,101,242,0.24), rgba(88,101,242,0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <Icon size={17} color="#96a4ff" strokeWidth={2} style={{ marginTop: -3 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', marginTop: 9, lineHeight: 1.3, position: 'relative' }}>{name}</div>
    </div>
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
          <div style={{ padding: '10px 12px', background: '#1e1f22', fontSize: 12, color: '#6d6f78' }}>🔎 Link Protect is scanning…</div>
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

/* ── Interactive: Scam Shield blitz demo ─────────────────────── */
function ScamShieldVisual() {
  // 0..3 = scam copies posted, 4 = deleted, 5 = verdict shown
  const [step, setStep] = useState(0);
  const timers = useRef<number[]>([]);

  const play = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setStep(0);
    [1, 2, 3, 4, 5].forEach((s, i) => {
      timers.current.push(window.setTimeout(() => setStep(s), 500 + i * 650));
    });
  };
  useEffect(() => { play(); return () => timers.current.forEach(window.clearTimeout); }, []);

  const channels = ['general', 'memes', 'giveaways'];
  return (
    <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hijacked account spams every channel</div>
        <button onClick={play} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, cursor: 'pointer', border: '1px solid #2e2e36', background: 'transparent', color: '#949ba4' }}>↻ Replay</button>
      </div>

      {channels.map((ch, i) => (
        <div key={ch} style={{ borderRadius: 8, border: '1px solid #2e2e36', background: '#1e1f22', padding: '8px 12px', minHeight: 38 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', marginBottom: 3 }}># {ch}</div>
          {step > i && (
            <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: step >= 4 ? 0.35 : 1, y: 0 }} transition={{ duration: 0.2 }}
              style={{ fontSize: 12, color: '#949ba4', textDecoration: step >= 4 ? 'line-through' : 'none' }}>
              <span style={{ color: '#f0b232', fontWeight: 600 }}>Scammer</span>{' '}
              🎁 I&apos;m giving away $5,600 to everyone! <span style={{ color: '#5865f2', textDecoration: 'underline' }}>gozawin.com</span>
            </motion.div>
          )}
        </div>
      ))}

      <div style={{ minHeight: 58 }}>
        {step >= 5 && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
            style={{ padding: '10px 12px', background: '#1e1f22', borderRadius: 8, border: '1px solid #2e2e36', borderLeft: '3px solid #f23f43' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f23f43', marginBottom: 2 }}>🛡️ Scam spam blocked</div>
            <div style={{ fontSize: 12, color: '#949ba4' }}>3 messages deleted · account banned · flagged network-wide</div>
          </motion.div>
        )}
      </div>
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

/* ── Block type chips (lucide icons — no emoji) ───────────────── */
const BLOCKERS: { name: string; icon: LucideIcon }[] = [
  { name: 'Nitro Scams', icon: Gift }, { name: 'Phishing Links', icon: Fish },
  { name: 'NSFW Sites', icon: EyeOff }, { name: 'Malware URLs', icon: Bug },
  { name: 'Discord Invites', icon: Mail }, { name: 'YouTube Links', icon: Youtube },
  { name: 'Twitch Streams', icon: Twitch }, { name: 'Steam Links', icon: Gamepad2 },
  { name: 'Google Links', icon: Search }, { name: 'URL Shorteners', icon: Link2 },
  { name: 'GIF Links', icon: ImageIcon }, { name: 'Custom Blacklist', icon: ClipboardList },
  { name: 'Link-only channels', icon: Pin }, { name: 'All external links', icon: Globe },
  { name: 'Scam Spam', icon: ShieldAlert }, { name: 'Raid Protection', icon: Siren },
];

/* ── Main ─────────────────────────────────────────────────────── */
export default function LandingClient() {
  const statsRef = useRef(null);

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', color: '#f2f3f5' }}>
      <Navbar />

      {/* HERO */}
      <section className="dot-grid" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '100px 24px 80px', position: 'relative', overflow: 'hidden' }}>
        {/* Branded backdrop (top.gg-style), faded down into the page */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '90%', backgroundImage: 'url(/hero-bg.webp)', backgroundSize: 'cover', backgroundPosition: 'center -8%', opacity: 0.22, WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, transparent 88%)', maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, transparent 88%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(88,101,242,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="hero-grid" style={{ maxWidth: 1120, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', position: 'relative' }}>
          <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            {/* badge */}
            <a href="https://discord.gg/BjDC9t329E" target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 99, padding: '5px 12px', textDecoration: 'none', marginBottom: 28 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#23a55a', flexShrink: 0 }} />
              v2.4.1 — Developer platform &amp; presets are live
              <ArrowRight size={12} />
            </a>

            <h1 className="hero-title" style={{ fontSize: 72, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1.0, color: '#f2f3f5', marginBottom: 20 }}>
              Stop every<br /><span style={{ color: '#5865f2' }}>bad link.</span><br />Automatically.
            </h1>

            <p style={{ fontSize: 18, color: '#6d6f78', lineHeight: 1.6, maxWidth: 420, marginBottom: 32 }}>
              16 independent shields blocking phishing, NSFW, scam spam and hijacked accounts — before they ever appear in your server.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href={BOT_INVITE} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#4752c4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#5865f2')}>
                Add to Discord — Free <ArrowRight size={15} />
              </a>
              <AppStoreBadge />
              <Link href="/dashboard"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600, color: '#949ba4', borderRadius: 10, textDecoration: 'none', border: '1px solid #2e2e36', transition: 'border-color 0.15s, color 0.15s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#52535a'; (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; (e.currentTarget as HTMLElement).style.color = '#949ba4'; }}>
                Dashboard
              </Link>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} style={{ display: 'flex', justifyContent: 'center' }}>
            <DiscordMockup />
          </motion.div>
        </div>
      </section>

      {/* STATS (live) */}
      <section ref={statsRef} className="noise" style={{ borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b', background: '#111113', padding: '52px 24px', position: 'relative' }}>
        <LiveStats />
      </section>

      {/* LINK CHECKER */}
      <section style={{ padding: '80px 24px', borderBottom: '1px solid #18181b' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#7289da', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 99, padding: '4px 12px', marginBottom: 22, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Shield size={12} /> Free URL Checker
          </div>
          <h2 className="cta-title" style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 14, lineHeight: 1.05 }}>
            Is this link safe?
          </h2>
          <p style={{ fontSize: 16, color: '#6d6f78', maxWidth: 440, margin: '0 auto 30px', lineHeight: 1.6 }}>
            Paste any link to check it against our live threat database — built from real scams blocked
            across thousands of Discord servers — plus Google Safe Browsing.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LinkChecker />
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/check" style={{ fontSize: 13, fontWeight: 600, color: '#7289da', textDecoration: 'none' }}>
              Open the full checker →
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES — bento grid */}
      <section id="features" style={{ padding: '100px 24px', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.035em', color: '#f2f3f5', marginBottom: 10 }}>Built to fight back.</h2>
          <p style={{ fontSize: 15, color: '#52535a' }}>Every demo below is interactive — this is exactly what happens in your server.</p>
        </div>
        <div className="bento-grid">
          <BentoCard
            span={4} row
            badge="Real-time detection"
            title="Catches threats the moment they're sent."
            description="Every message is scanned instantly. Malicious links are deleted before anyone can click them — no delay, no manual review."
            bullets={[
              'Google Safe Browsing + our own live threat database',
              'Pattern-matching for Nitro scams and look-alike domains',
            ]}
            visual={<LinkScannerVisual />}
          />
          <BentoCard
            span={2}
            badge="Warning system"
            title="Progressive punishment. Your rules."
            description="Repeat offenders escalate through timeout, kick and ban — at thresholds you set."
            visual={<WarnSimulator />}
          />
          <BentoCard
            span={2}
            badge="Silent mode"
            title="Moderation without the noise."
            description="Links get deleted quietly, the user gets a private DM — your channels stay clean."
            visual={<SilentModeVisual />}
          />
          <BentoCard
            span={4} row
            badge="Scam Shield — new"
            title="Hijacked accounts, stopped in seconds."
            description="When an account pastes the same scam into channel after channel, Scam Shield deletes every copy, removes the account, and flags it across the whole Link Protect network."
            bullets={[
              'Known scam accounts are removed the moment they join',
              'Flags come only from live behaviour — never keywords or reports',
            ]}
            visual={<ScamShieldVisual />}
          />
        </div>
      </section>

      {/* WHAT WE BLOCK */}
      <section id="blockers" className="noise" style={{ padding: '80px 24px', background: '#111113', borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b', position: 'relative' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.035em', color: '#f2f3f5', marginBottom: 10 }}>16 shields. Every threat covered.</h2>
            <p style={{ fontSize: 15, color: '#52535a' }}>Toggle each protection on or off — per server, per channel.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
            {BLOCKERS.map(({ name, icon }) => (
              <ShieldTile key={name} name={name} icon={icon} />
            ))}
          </div>
        </div>
      </section>

      {/* APP */}
      <AppSection />

      {/* LEADERBOARD — vote reward */}
      <section style={{ padding: '96px 24px', borderTop: '1px solid #18181b' }}>
        <Leaderboard />
        <SupporterWall />
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
            Add Link Protect in 30 seconds. Works out of the box — no setup required.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={BOT_INVITE} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none', transition: 'background 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#4752c4')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#5865f2')}>
              Add to Discord — It&apos;s free <ArrowRight size={15} />
            </a>
            <AppStoreBadge />
            <a href={SUPPORT_SERVER} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 26px', fontSize: 15, fontWeight: 600, color: '#949ba4', borderRadius: 10, textDecoration: 'none', border: '1px solid #2e2e36', transition: 'border-color 0.15s, color 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#52535a'; e.currentTarget.style.color = '#f2f3f5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2e2e36'; e.currentTarget.style.color = '#949ba4'; }}>
              <ExternalLink size={15} /> Join Support Server
            </a>
          </div>
        </motion.div>
      </section>

      <style>{`
        .bento-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        @media (max-width: 920px) {
          .bento-grid { grid-template-columns: 1fr; }
          .bento-card { grid-column: span 1 !important; flex-direction: column !important; }
        }
        .lp-shield-glow {
          position: absolute; inset: 0; opacity: 0; transition: opacity 0.25s; pointer-events: none;
          background: radial-gradient(130px circle at var(--gx, 50%) var(--gy, 50%), rgba(88,101,242,0.24), transparent 70%);
        }
        .lp-shield:hover { border-color: rgba(88,101,242,0.6) !important; }
        .lp-shield:hover .lp-shield-glow { opacity: 1; }
      `}</style>
    </div>
  );
}
