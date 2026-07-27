'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  PartyPopper, LayoutDashboard, SlidersHorizontal, ScrollText, ArrowRight,
  Eye, UserCheck, Gavel, Trash2, MessageSquare, Settings2, ChevronDown,
  ExternalLink, KeyRound,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { SUPPORT_SERVER } from '@/lib/discord';

/* ── 3-step guide ─────────────────────────────────────────────── */
const STEPS = [
  {
    icon: LayoutDashboard,
    title: 'Open your dashboard',
    body: 'Sign in with Discord and pick your server — every setting the bot has, in one place.',
    cta: { label: 'Open dashboard', href: '/dashboard' },
  },
  {
    icon: SlidersHorizontal,
    title: 'Pick a protection preset',
    body: 'Balanced is recommended for most servers — one click in the Blockers tab, or /setup-preset right in Discord.',
  },
  {
    icon: ScrollText,
    title: 'Set a log channel',
    body: 'Use /warn log #channel (or the dashboard) so you see exactly what gets blocked and why.',
  },
];

/* ── Command reference — all 18 slash commands, grouped ───────── */
const COMMAND_GROUPS: { title: string; commands: { cmd: string; desc: string }[] }[] = [
  {
    title: 'Get started',
    commands: [
      { cmd: '/help', desc: 'Every command and how the bot works' },
      { cmd: '/dashboard', desc: 'Get the link to your web dashboard' },
      { cmd: '/setup-preset', desc: 'Apply Relaxed, Balanced or Strict in one go' },
      { cmd: '/invite', desc: 'Invite link for another server' },
      { cmd: '/support', desc: 'Join the support server' },
    ],
  },
  {
    title: 'Protection',
    commands: [
      { cmd: '/blocker', desc: 'Turn each link blocker on or off' },
      { cmd: '/check-link', desc: 'Scan any URL on demand' },
      { cmd: '/whitelist …', desc: 'Let channels, members or roles bypass the blockers' },
      { cmd: '/blacklist …', desc: 'Your own always-block domains' },
      { cmd: '/lockdown', desc: 'Freeze the server in an emergency' },
      { cmd: '/unlock', desc: 'Lift a lockdown' },
    ],
  },
  {
    title: 'Warnings',
    commands: [
      { cmd: '/warn add · list · remove · reset', desc: 'Manage warnings by hand' },
      { cmd: '/warn kick-at · ban-at · timeout', desc: 'Set your escalation thresholds' },
      { cmd: '/warn decay', desc: 'Let old warnings expire automatically' },
      { cmd: '/warn log', desc: 'Choose where blocks and warnings are logged' },
    ],
  },
  {
    title: 'Insights & more',
    commands: [
      { cmd: '/stats', desc: 'Protection stats for this server' },
      { cmd: '/modstats', desc: 'See which mods act the most' },
      { cmd: '/ping', desc: 'Bot latency and status' },
      { cmd: '/premium', desc: 'Perks and upgrade options' },
    ],
  },
];

/* ── Permissions explainer ────────────────────────────────────── */
const PERMS = [
  {
    icon: Eye,
    name: 'View & Manage Channels',
    why: 'Read messages so links can be scanned, and set up lockdown and the verification gate.',
  },
  {
    icon: UserCheck,
    name: 'Manage Roles',
    why: 'Hand out the verified role when members pass your verification gate.',
  },
  {
    icon: Gavel,
    name: 'Kick, Ban & Timeout Members',
    why: 'Enforce the warning thresholds you set — automatically, at exactly the limits you chose.',
  },
  {
    icon: Trash2,
    name: 'Manage Messages',
    why: 'Delete a bad link the instant it is posted — before anyone can click it.',
  },
  {
    icon: MessageSquare,
    name: 'Send Messages & Embed Links',
    why: 'Post warnings, log entries and info embeds in your channels.',
  },
  {
    icon: Settings2,
    name: 'Manage Server',
    why: 'Read basic server info so the dashboard and presets can do their job.',
  },
];

/* ── FAQ ──────────────────────────────────────────────────────── */
const FAQ = [
  {
    q: 'A safe link got blocked — what now?',
    a: 'Add the domain to your allowlist with /whitelist or in the dashboard’s Access tab — it will never be touched again. Premium adds a one-click undo right on the log message.',
  },
  {
    q: 'Does the bot read DMs?',
    a: 'No. Link Protect only scans messages in servers it was invited to, and it never stores message content.',
  },
  {
    q: 'What if the bot goes offline?',
    a: 'Nothing is deleted and nothing breaks — your server just behaves as if the bot were not there, and protection resumes the moment it is back.',
  },
  {
    q: 'How do I remove Link Protect?',
    a: 'Just kick the bot from your server. Your settings are kept, so if you ever re-invite it everything is back the way you left it.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5' }}>{q}</span>
        <ChevronDown size={16} color="#6d6f78" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <p style={{ padding: '0 20px 16px', fontSize: 13.5, color: '#949ba4', lineHeight: 1.6 }}>{a}</p>
      )}
    </div>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px', ...style }}>{children}</section>;
}

export default function WelcomeClient() {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 60, position: 'relative' }}>
      <div aria-hidden className="dot-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      <Navbar />

      {/* Hero */}
      <Section style={{ paddingTop: 64, textAlign: 'center', maxWidth: 760 }}>
        <div className="eyebrow" style={{ marginBottom: 22 }}>
          <PartyPopper size={12} /> Welcome aboard
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 14, lineHeight: 1.05 }}>
          You invited Link Protect —<br />you&rsquo;re already protected 🎉
        </h1>
        <p style={{ fontSize: 16, color: '#6d6f78', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          The malware, phishing and nitro-scam blockers are on from the very first second — no setup
          needed. Three quick steps take you from protected to perfectly tuned.
        </p>
      </Section>

      {/* 3-step guide */}
      <Section style={{ paddingTop: 56 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {STEPS.map((s, i) => (
            <div key={s.title} className="card-hover" style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(88,101,242,0.14)', border: '1px solid rgba(88,101,242,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#96a4ff', flexShrink: 0 }}>
                  {i + 1}
                </div>
                <s.icon size={17} color="#96a4ff" />
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#f2f3f5', marginBottom: 6 }}>{s.title}</div>
              <p style={{ fontSize: 13.5, color: '#6d6f78', lineHeight: 1.55, marginBottom: s.cta ? 16 : 0 }}>{s.body}</p>
              {s.cta && (
                <Link href={s.cta.href} className="btn-primary" style={{ fontSize: 13.5, marginTop: 'auto', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {s.cta.label} <ArrowRight size={13} />
                </Link>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Command reference */}
      <Section style={{ paddingTop: 80 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' }}>All 18 slash commands at a glance</h2>
        <p style={{ fontSize: 14, color: '#6d6f78', textAlign: 'center', marginBottom: 32 }}>
          Everything also lives in the dashboard — commands are just faster when you&rsquo;re already in Discord.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {COMMAND_GROUPS.map((g) => (
            <div key={g.title} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#52535a', marginBottom: 10 }}>{g.title}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {g.commands.map((c) => (
                      <tr key={c.cmd} style={{ borderTop: '1px solid #1e1e22' }}>
                        <td style={{ padding: '8px 12px 8px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          <code style={{ fontSize: 12.5, fontWeight: 600, color: '#96a4ff', background: 'rgba(88,101,242,0.08)', padding: '2px 6px', borderRadius: 5 }}>{c.cmd}</code>
                        </td>
                        <td style={{ padding: '8px 0', fontSize: 13, color: '#949ba4', lineHeight: 1.5 }}>{c.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Permissions explainer */}
      <Section style={{ paddingTop: 80 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <KeyRound size={16} color="#96a4ff" />
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em' }}>Why the bot asks for these permissions</h2>
          </div>
          <p style={{ fontSize: 14, color: '#6d6f78', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            The invite requests a small, focused set of permissions — each one has exactly one job.
            Link Protect never asks for Administrator.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {PERMS.map((p) => (
            <div key={p.name} className="card-hover" style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: 18, display: 'flex', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(88,101,242,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <p.icon size={17} color="#96a4ff" />
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f2f3f5', marginBottom: 4 }}>{p.name}</div>
                <p style={{ fontSize: 13, color: '#6d6f78', lineHeight: 1.5 }}>{p.why}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section style={{ paddingTop: 80, maxWidth: 760 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 32, letterSpacing: '-0.02em' }}>Good to know</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </Section>

      {/* Closing CTA */}
      <Section style={{ paddingTop: 72, paddingBottom: 96, maxWidth: 720 }}>
        <div style={{ padding: '32px 24px', background: 'linear-gradient(180deg, rgba(88,101,242,0.08), transparent)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 16, textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', marginBottom: 8 }}>Questions? We&rsquo;re around.</h2>
          <p style={{ fontSize: 14, color: '#6d6f78', marginBottom: 20, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            The dashboard has everything you just read — and the support server has real humans.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/dashboard" className="btn-primary" style={{ fontSize: 14 }}>
              Open dashboard
            </Link>
            <a href={SUPPORT_SERVER} target="_blank" rel="noreferrer" className="btn-secondary" style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ExternalLink size={14} /> Join support server
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}
