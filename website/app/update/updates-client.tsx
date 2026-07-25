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
  /* ── Latest ──────────────────────────────────────────────────── */
  {
    product: 'bot', date: 'July 25, 2026', ts: d('2026-07-25') + 5, version: '2.6.0',
    title: 'Message Studio, smarter embeds & a tidy command list',
    items: [
      'Every message the bot sends — warnings, DMs, the verification invite, the lockdown announcement — now uses your templates from the dashboard’s Messages tab.',
      'Log embeds grew up: member avatars, timestamps, one action color ramp (warn / kick / ban / timeout) matching the web dashboard — and buttons to remove a warning or open the dashboard right from Discord. Removing a warning replaces the log entry with a removal notice, visible in the web activity log too. Accounts flagged in the scam network get an appeal link in their DM.',
      'Optional daily digest: one summary embed per day instead of a message per action.',
      '61 commands became 18: all enable-/disable- pairs are now /blocker, warnings live under /warn (add · list · remove · reset · kick-at · ban-at · timeout · decay · log), whitelists under /whitelist, the blacklist under /blacklist — plus a rewritten /help with topic picker.',
      'Escalations now DM the member before a kick or ban (customizable), so people always know what happened.',
      'Warned members always see their current count and how many warnings remain until the next step — now including timeout, not just kick/ban.',
    ],
  },
  {
    product: 'website', date: 'July 25, 2026', ts: d('2026-07-25') + 4,
    title: 'Message Studio — the bot in your words',
    items: [
      'New Messages tab in the server dashboard: customize every text the bot sends — blocked-link warnings, manual warns, silent-mode DMs, escalation DMs, the verification DM and the lockdown announcement.',
      'Tone presets (Friendly / Neutral / Strict) fill all templates in one click; variables like {user}, {reason} or {warnings} insert as chips right at your cursor.',
      'Live Discord-style preview with sample values that follows the field you’re editing — and scrolls with you.',
      '“Send me a test DM” delivers any template to your own Discord — as the complete embed with title, warning count, footer and buttons, exactly as members see it; the live preview follows you while scrolling.',
      'Warn-log: new Daily digest option — one summary embed per day instead of a message per action (Scam Shield, raid and lockdown alerts stay live).',
    ],
  },
  {
    product: 'bot', date: 'July 25, 2026', ts: d('2026-07-25') + 2, version: '2.5.1',
    title: 'Missing-permission alerts',
    items: [
      'When Scam Shield, Raid Shield or a warn escalation can’t kick, ban or time out someone — missing permission or role rank — the failure is no longer silent.',
      'You get an orange alert in your log channel with the exact cause and fix, and the app receives a push notification.',
      'Repeated failures for the same user are deduplicated to one alert per hour.',
      'The invite link now requests Manage Roles & Manage Server up front — the verification gate and emergency lockdown need them, so fresh installs start without permission gaps.',
    ],
  },
  {
    product: 'website', date: 'July 25, 2026', ts: d('2026-07-25') + 3,
    title: 'Server dashboard redesign',
    items: [
      'New command-center header: your server icon as a blurred banner, a state color that shifts with what’s happening (calm / threat handled / lockdown), an animated Security-Score ring and one clear next step.',
      'Live pulse: a slim 14-day activity sparkline right under the breadcrumb.',
      'Link blockers became a tile wall — grouped, glowing icon tiles instead of a toggle list, with Block All Links as a master tile.',
      'The activity log is now a real timeline: grouped by day, with avatars, filter chips and expandable details per entry.',
      'Grouped sidebar (Protection / Members / Insights / System) with live badges — new log entries since your last visit, and a warning when the verification health check fails.',
      'Warnings stat card shows a weekly delta with a sparkline watermark; empty states got personality.',
    ],
  },
  {
    product: 'website', date: 'July 25, 2026', ts: d('2026-07-25') + 1.5,
    title: 'Design polish — one look everywhere',
    items: [
      'Link previews: sharing any link-protect.com page in Discord or Twitter now shows a branded preview card.',
      'One design language: unified colors (one green, one action color ramp for warn/kick/ban/timeout), shared buttons, matching toggles and the same eyebrow badge on every page.',
      'Every page got the landing treatment — dot-grid headers on the checker, developers, changelog and legal pages, plus soft page-to-page transitions.',
      'Proper 404 and error pages, loading skeletons instead of flashing zeros on the live stats, leaderboard and supporter wall.',
      'Accessibility: visible keyboard focus rings, honored “reduce motion” (including the confetti), dark Firefox scrollbars, printable legal pages and readable footer text.',
      'Faster first paint: the Inter font is now self-hosted instead of render-blocking, with steady tabular numerals on all counters.',
      'Admin cleanup: consistent English throughout, real link-checker shortcuts on reports, and friendly protection names instead of raw keys on the Overview.',
    ],
  },
  {
    product: 'website', date: 'July 25, 2026', ts: d('2026-07-25') + 1,
    title: 'Permission-problem banner in the dashboard',
    items: [
      'The server dashboard now shows a warning banner when the bot recently couldn’t enforce an action, with the reason and how to fix it — dismissible until it happens again.',
    ],
  },
  {
    product: 'bot', date: 'July 24, 2026', ts: d('2026-07-24') + 2, version: '2.5.0',
    title: 'Emergency lockdown & verification gate',
    items: [
      '/lockdown freezes the whole server in seconds — 30s slowmode everywhere, invites paused, every link blocked. /unlock restores everything exactly as it was.',
      'Verification gate: new members verify on your personal web page; quarantine mode assigns the lock role on join and DMs the verify link automatically.',
    ],
  },
  {
    product: 'website', date: 'July 24, 2026', ts: d('2026-07-24') + 1,
    title: 'Verification tab, lockdown button & changelog',
    items: [
      'New Verification tab: mode (quarantine / verified role), role picker, minimum account age, and a fully customizable verify page with live preview.',
      'One-click auto-setup: creates (or reuses) the quarantine role, hides every category & channel from it, and adds a #verify info channel — no manual permission work.',
      'Warn-log filter: choose exactly which events appear in your log channel — blocked links, manual warns, Scam Shield, raids, lockdowns and (opt-in) verifications.',
      'Dashboard tour now covers the Security Score, presets, lockdown and the verification gate.',
      'Every settings card is now collapsible — click its header to fold it away; the dashboard remembers your layout.',
      'Access Control whitelists use the same card design as every other settings block.',
      'Landing: the iOS section became a compact tap-through phone showcase with all six current app screens.',
      'Custom background image for your verify page — auto-resized and compressed on upload, rendered faded like our homepage hero.',
      'Live permission check — see instantly whether the bot has the rights and role position the gate and lockdown need.',
      'Emergency lockdown as a compact control in the dashboard header — pulses red while active, one click restores everything.',
      'Public per-server verify pages at link-protect.com/verify/<server> in your colors.',
      'This changelog page — and verification-gate adoption in the admin protection graph.',
    ],
  },

  /* ── iOS App ─────────────────────────────────────────────────── */
  {
    product: 'app', date: 'July 25, 2026', ts: d('2026-07-25') + 0.5, upcoming: true,
    title: 'Message Studio in the app',
    items: [
      'New Messages section in every server config: edit all six bot templates on the go — with variable chips, character counter, reset to default and the daily-digest toggle.',
    ],
  },
  {
    product: 'app', date: 'July 25, 2026', ts: d('2026-07-25'), upcoming: true, version: '1.1.0',
    title: 'Lockdown, verification, Share Extension & a real Watch app',
    items: [
      'Emergency lockdown button and the full verification-gate settings, right in the app.',
      'Check any link straight from the share sheet in Safari, Discord or anywhere else — full verdict with redirect chain, no sign-in needed.',
      'The Apple Watch app grew four tabs: live status, servers with emergency lockdown from your wrist (relayed via iPhone), a moderation activity feed and your vote streak.',
      'Watch-face complications, and Lock Screen widgets fixed for iOS 17 (containerBackground).',
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
    <div style={{ minHeight: '100vh', paddingTop: 60, position: 'relative' }}>
      <div aria-hidden className="dot-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      <Navbar />

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '56px 24px 96px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 20 }}>
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
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = '#52535a'; e.currentTarget.style.color = '#f2f3f5'; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = '#2e2e36'; e.currentTarget.style.color = '#949ba4'; } }}
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
