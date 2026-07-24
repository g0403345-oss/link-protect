'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Globe, Smartphone, Sparkles, History } from 'lucide-react';
import Navbar from '@/components/Navbar';

type Product = 'bot' | 'website' | 'app';

const PRODUCTS: Record<Product, { label: string; color: string; icon: typeof Bot }> = {
  bot: { label: 'Bot', color: '#5865f2', icon: Bot },
  website: { label: 'Website', color: '#23a55a', icon: Globe },
  app: { label: 'iOS App', color: '#eb459e', icon: Smartphone },
};

interface Entry {
  product: Product;
  /** Display date — exact where known, an honest period otherwise. */
  date: string;
  /** Sort key, newest first. */
  ts: number;
  version?: string;
  title: string;
  items: string[];
  upcoming?: boolean;
}

const d = (iso: string) => new Date(iso + 'T12:00:00Z').getTime();

const ENTRIES: Entry[] = [
  /* ── iOS App ─────────────────────────────────────────────────── */
  {
    product: 'app', date: 'In development', ts: d('2026-07-25'), upcoming: true,
    title: 'Share Extension & Watch complications',
    items: [
      'Check any link straight from the share sheet in Safari, Discord or anywhere else — full verdict with redirect chain, no sign-in needed.',
      'Watch-face complications: bot status, server count and warnings right on your Apple Watch face.',
    ],
  },
  {
    product: 'app', date: 'July 16, 2026', ts: d('2026-07-16'),
    title: 'Scam Shield in the app',
    items: [
      'Full Scam Shield configuration: cross-channel spam detection, action picker and the known-scammer join check.',
      'Network stats — flagged accounts, new flags this week, catches in your server.',
      'One-tap member scan to remove flagged accounts that joined earlier.',
    ],
  },
  {
    product: 'app', date: 'June 26, 2026', ts: d('2026-06-26'),
    title: 'Custom app backgrounds',
    items: [
      'Pick your look in Settings: Midnight, Link Protect, Pure Black, Ocean, Sunset or Aurora.',
    ],
  },
  {
    product: 'app', date: 'June 2026', ts: d('2026-06-15'), version: '1.0',
    title: 'Link Protect for iOS — App Store release',
    items: [
      'Manage every server on the go: blockers, warnings, channel rules, access control and blacklists.',
      'Push alerts when a rule fires, settings change or the bot goes offline — with quick actions like Reset warnings and Ban.',
      'Home Screen and Lock Screen widgets plus a full Apple Watch app.',
      'Face ID lock and a demo mode — sign in with Discord, no extra account.',
    ],
  },

  /* ── Website ─────────────────────────────────────────────────── */
  {
    product: 'website', date: 'July 24, 2026', ts: d('2026-07-24'),
    title: 'Landing redesign & an instant dashboard',
    items: [
      'New landing: looping threat-story hero, bento feature grid and a 3D shield wall for all 16 blockers.',
      'Link checker got a scan animation and shared results now unfurl with a live verdict card in Discord and Twitter.',
      'Dashboard: all-servers overview with sparklines, an optional poster view, server-tinted dashboards and one-click protection presets.',
      'Trends chart grew real tooltips, a y-axis and Scam Shield / raid event markers.',
      'Confetti at a perfect Security Score, growing streak flames, and a proper mobile navigation.',
    ],
  },
  {
    product: 'website', date: 'July 23, 2026', ts: d('2026-07-23') + 2,
    title: 'Developer platform',
    items: [
      'Per-server API keys with a read-only REST API: /api/v1/stats, /api/v1/trends and /api/v1/check.',
      'Signed webhooks for moderation events — link blocked, kicks/bans, Scam Shield catches, raids.',
      'Live SVG embeds: protected-by badge, server stats card and voter leaderboard.',
      'Developer access requests in Settings, docs at /developers, data export and a beta programme.',
    ],
  },
  {
    product: 'website', date: 'July 23, 2026', ts: d('2026-07-23') + 1,
    title: 'Security Score & deep link checker',
    items: [
      'Every server dashboard shows a Security Score (0–100) with one-click recommendations.',
      'The link checker follows the full redirect chain server-side — shorteners can no longer hide their target.',
      'Category explanations and shareable result links on /check.',
    ],
  },
  {
    product: 'website', date: 'July 22, 2026', ts: d('2026-07-22'),
    title: 'Voter perks & leaderboard',
    items: [
      'Vote streaks with daily flames, milestone badges (Bronze → Silver → Gold → Diamond) and the ♥ Supporter role.',
      'Monthly top-voter leaderboard with podium, plus the Supporter Wall.',
      'Navbar level bar showing your progress to the next tier.',
    ],
  },
  {
    product: 'website', date: 'July 16, 2026', ts: d('2026-07-16'),
    title: 'Scam Shield on the web',
    items: [
      'New Scam Shield tab: spam detection settings, join check and network stats.',
      'Flagged-accounts admin view and a public appeal flow for flagged users.',
      'Website sessions no longer expire after 7 days — silent token refresh.',
    ],
  },
  {
    product: 'website', date: 'Early July 2026', ts: d('2026-07-08'),
    title: 'Tickets, notifications & remote moderation',
    items: [
      'Reports became two-way conversations — reply to the team right on the site.',
      'Notification centre (bell) for replies, warnings and settings changes.',
      'Moderate members from the dashboard: warn, timeout, kick and ban with automatic escalation.',
    ],
  },
  {
    product: 'website', date: 'Late June 2026', ts: d('2026-06-28'),
    title: 'Team access, trends & channel rules',
    items: [
      'Delegate dashboard access to teammates without giving them Discord admin.',
      'Activity trends chart with top reasons.',
      'Per-channel rules editor and a guided dashboard tour for first-time visitors.',
    ],
  },
  {
    product: 'website', date: 'Spring 2026', ts: d('2026-05-01'),
    title: 'link-protect.com launch',
    items: [
      'Full settings dashboard for every server — no more command chains.',
      'Public link checker backed by the live threat database and Google Safe Browsing.',
      'Live protection stats on the landing page.',
    ],
  },

  /* ── Bot ─────────────────────────────────────────────────────── */
  {
    product: 'bot', date: 'July 23, 2026', ts: d('2026-07-23'), version: '2.4.1',
    title: 'One-command setup & a unified look',
    items: [
      '/setup-preset — full protection in one command: Minimal, Balanced or Strict.',
      'Manual /warn now escalates exactly like automatic warnings — timeout, decay and clear permission hints included.',
      'Every bot reply got one consistent design, and the welcome message was rewritten with a real quick-start.',
    ],
  },
  {
    product: 'bot', date: 'July 16, 2026', ts: d('2026-07-16'), version: '2.4.0',
    title: 'Scam Shield',
    items: [
      'Stops hijacked accounts pasting the same scam into every channel — all copies deleted, account timed out / kicked / banned.',
      'Cross-server intelligence: caught accounts are flagged network-wide.',
      'Optional join check removes known scam accounts the moment they join.',
    ],
  },
  {
    product: 'bot', date: 'July 12, 2026', ts: d('2026-07-12'),
    title: 'Stability hardening',
    items: [
      '"Database is locked" errors eliminated for good — stuck transactions now roll back automatically.',
    ],
  },
  {
    product: 'bot', date: 'June 26, 2026', ts: d('2026-06-26'), version: '2.3.0',
    title: 'Warning decay & per-channel rules',
    items: [
      'Warnings can expire automatically after a set number of days (/warn-decay).',
      'Per-channel rules: follow the server, turn protection off, or pick custom blockers per channel.',
      'Kick/ban failures now explain exactly why (owner / permissions / role order) and how to fix it.',
    ],
  },
  {
    product: 'bot', date: 'June 5, 2026', ts: d('2026-06-05'), version: '2.1.0',
    title: 'Performance overhaul',
    items: [
      'Message scanning got dramatically faster — 28 database reads per message became one cached read.',
      'Automatic sharding for smooth scaling across thousands of servers.',
      'False-positive fixes: plain text like "free nitro" or bare domain-like words no longer trigger blocks.',
      'New commands: /ping, /stats, /check-link and /warn-reset.',
    ],
  },
  {
    product: 'bot', date: 'Spring 2026', ts: d('2026-04-01'), version: '2.0',
    title: 'Link Protect V2 — the relaunch',
    items: [
      'Complete rebuild on a new storage backend.',
      '14 independent link blockers — malware, nitro scams, NSFW, invites, shorteners and more.',
      'Warning system with kick/ban thresholds, silent mode and raid protection.',
    ],
  },
];

const TABS: ('all' | Product)[] = ['all', 'bot', 'website', 'app'];

export default function UpdatesClient() {
  const [tab, setTab] = useState<'all' | Product>('all');
  const entries = ENTRIES
    .filter((e) => tab === 'all' || e.product === tab)
    .sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ minHeight: '100vh', paddingTop: 60 }}>
      <Navbar />

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '56px 24px 96px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#7289da', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 99, padding: '4px 12px', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <History size={12} /> Changelog
          </div>
          <h1 style={{ fontSize: 'clamp(30px, 5.5vw, 44px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', lineHeight: 1.08, marginBottom: 12 }}>
            What&rsquo;s new in Link Protect
          </h1>
          <p style={{ fontSize: 15, color: '#6d6f78', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            Every release across the bot, the website and the iOS app — newest first.
          </p>
        </div>

        {/* Product filter */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 40, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = tab === t;
            const meta = t === 'all' ? null : PRODUCTS[t];
            const color = meta?.color ?? '#f2f3f5';
            const Icon = meta?.icon ?? Sparkles;
            return (
              <button key={t} onClick={() => setTab(t)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 99, cursor: 'pointer', border: `1px solid ${active ? color : '#2e2e36'}`, background: active ? `${color}1a` : '#111113', color: active ? color : '#949ba4', transition: 'all 0.15s' }}>
                <Icon size={13} /> {meta?.label ?? 'All updates'}
              </button>
            );
          })}
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', paddingLeft: 34 }}>
          <div aria-hidden style={{ position: 'absolute', left: 11, top: 6, bottom: 6, width: 2, background: 'linear-gradient(180deg, #2e2e36, #1e1e22)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {entries.map((e, i) => {
              const meta = PRODUCTS[e.product];
              return (
                <motion.div key={`${e.product}-${e.ts}-${e.title}`}
                  initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.2) }}
                  style={{ position: 'relative' }}>
                  {/* timeline dot */}
                  <span aria-hidden style={{ position: 'absolute', left: -34 + 4, top: 22, width: 16, height: 16, borderRadius: '50%', background: '#0a0a0c', border: `2px solid ${meta.color}`, boxShadow: `0 0 10px ${meta.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />

                  <div style={{ background: '#111113', border: `1px solid ${e.upcoming ? `${meta.color}55` : '#1e1e22'}`, borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}35`, padding: '2px 9px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <meta.icon size={10} /> {meta.label}
                      </span>
                      {e.version && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', padding: '2px 8px', borderRadius: 99, fontFamily: 'monospace' }}>
                          v{e.version}
                        </span>
                      )}
                      {e.upcoming && (
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#f0b232', background: 'rgba(240,178,50,0.12)', border: '1px solid rgba(240,178,50,0.3)', padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Coming soon
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#52535a', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.date}</span>
                    </div>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em', marginBottom: 10 }}>{e.title}</h2>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {e.items.map((it) => (
                        <li key={it} style={{ display: 'flex', gap: 9, fontSize: 13.5, color: '#949ba4', lineHeight: 1.55 }}>
                          <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, flexShrink: 0, marginTop: 7 }} />
                          {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#52535a', marginTop: 40, lineHeight: 1.6 }}>
          Dates before June 2026 are approximate. In Discord, <code style={{ fontFamily: 'monospace', color: '#949ba4' }}>/update</code> always
          shows the two most recent bot releases.
        </p>
      </div>
    </div>
  );
}
