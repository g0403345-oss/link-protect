'use client';

/**
 * Standalone REDESIGN PREVIEW — a fully-populated demo server, no login and no
 * bot API needed. Intercepts window.fetch for /api/* and serves realistic mock
 * data into the real guild-dashboard component. Open /demo to view.
 * Preview-only route: not linked anywhere and meant for the local dev server.
 */

import { SessionProvider } from 'next-auth/react';
import GuildDashboard from '../../dashboard/[guildId]/page';

const GID = '864823666952372245';
const NOW = () => Math.floor(Date.now() / 1000);

/* ── Mock data ─────────────────────────────────────────────── */

const USERS: Record<string, string> = {
  '480734480072114177': 'n1tro_gifts',
  '223832988311617536': 'ScamSeller99',
  '997020812345678901': 'quandale',
  '331157842321768448': 'crypto_carl',
};

const SETTINGS = {
  protect: { all: false, malware: true, nitro: true, bit: true, invite: true, nsfw: true, youtube: false, google: false, gif: false, twitch: false, steam: false },
  silent: false,
  warn: {
    kick: 5, ban: 8, timeout: { warnings: 3, time: 20 },
    '480734480072114177': { Warn: 4, reason: ['Posted a fake Nitro giveaway link', 'Scam Shield: same message in 4 channels within seconds', 'bit.ly shortener link', 'Phishing domain (steamcommunlty.ru)'], ts: [NOW() - 86400 * 6, NOW() - 86400 * 4, NOW() - 86400 * 2, NOW() - 7200] },
    '223832988311617536': { Warn: 2, reason: ['Malware link blocked', 'Discord invite spam'], ts: [NOW() - 86400 * 3, NOW() - 86400] },
    '997020812345678901': { Warn: 1, reason: ['NSFW link'], ts: [NOW() - 86400 * 5] },
  },
  decay: { enabled: true, days: 30 },
  log: { Activated: true, 'log-channel': 1101, link: true, onlylink: false, show: {} },
  link: { links: ['casino-win.io', 'free-nitro.club'], allow: ['norecoil.de'] },
  channel: { channel: [], category: [], member: [], role: [] },
  raid: { enabled: false, threshold: 5, window: 10, timeout_minutes: 60 },
  scamguard: { enabled: true, channels: 3, window: 10, action: 'ban', timeout_minutes: 60, join_check: true, join_action: 'kick', min_servers: 2 },
  verify: { enabled: true, role_mode: 'quarantine', role_id: '1102', min_account_age_days: 7, page: { headline: '', message: '', accent: '#5865f2', rules: 'Be kind. No advertising. Follow the Discord ToS.', require_accept: true } },
  messages: { accent: '#23a55a', footer_text: 'Norecoil Community', welcome: 'Welcome to **{server}**, {user}! 🎉', leave: '**{username}** left the server.', welcome_channel: '1103' },
};

function actions() {
  const n = NOW();
  const mk = (h: number, uid: string, action: string, reason: string, warn: number, ch = '1103') =>
    ({ user_id: uid, username: USERS[uid], channel_id: ch, action, reason, warn_count: warn, timestamp: n - Math.round(h * 3600) });
  return { actions: [
    mk(1.2, '997020812345678901', 'unwarned', 'False positive review by tadanosenshi', 0),
    mk(2.6, '480734480072114177', 'banned', 'Scam Shield: same message in 4 channels within seconds', 4),
    mk(5.1, '223832988311617536', 'warned', 'bit.ly shortener link — hidden target', 2),
    mk(8.4, '997020812345678901', 'timeout', 'Auto-timeout: reached 3 warnings', 3),
    mk(11.2, '331157842321768448', 'warned', 'Fake Nitro giveaway link (discord-nltro.gift)', 1),
    mk(26, '480734480072114177', 'warned', 'Phishing domain blocked (steamcommunlty.ru)', 3),
    mk(29, '223832988311617536', 'warned', 'Discord invite spam', 1),
    mk(33, '331157842321768448', 'kicked', 'Auto-kick: reached 5 warnings', 5),
    mk(38, '997020812345678901', 'warned', 'NSFW link', 1),
    mk(50, '480734480072114177', 'warned', 'Scam Shield: same message in 3 channels', 2),
    mk(55, '223832988311617536', 'timeout', 'Raid defense: mass-posted casino-win.io', 1),
    mk(60, '331157842321768448', 'warned', 'Malware link blocked', 2),
    mk(75, '480734480072114177', 'warned', 'bit.ly shortener link', 1),
    mk(80, '997020812345678901', 'warned', 'Blacklisted domain: free-nitro.club', 1),
    mk(99, '223832988311617536', 'banned', 'Scam Shield: known scam account (caught on 6 servers)', 0),
    mk(120, '331157842321768448', 'warned', 'Discord invite spam', 1),
  ] };
}

function trends(days: number) {
  const counts = [1, 3, 2, 4, 2, 5, 3, 6, 4, 7, 5, 9, 6, 8, 4, 6, 7, 5, 8, 9, 6, 7, 5, 8, 10, 7, 9, 11, 8, 10];
  const perDay = Array.from({ length: days }, (_, i) => {
    const c = counts[(counts.length - days + i + counts.length) % counts.length];
    const d = new Date(Date.now() - (days - 1 - i) * 86400000);
    return {
      date: d.toISOString().slice(0, 10),
      warned: Math.max(0, c - 2), kicked: c > 5 ? 1 : 0, banned: c > 7 ? 1 : 0, timeout: c > 3 ? 1 : 0,
      count: c, scamshield: c > 6 ? 1 : 0, raid: c > 8 ? 1 : 0,
    };
  });
  const tot = (k: 'warned' | 'kicked' | 'banned' | 'timeout') => perDay.reduce((s, x) => s + x[k], 0);
  return { days, total: perDay.reduce((s, x) => s + x.count, 0), perDay,
    totals: { warned: tot('warned'), kicked: tot('kicked'), banned: tot('banned'), timeout: tot('timeout') },
    topReasons: [
      { reason: 'Scam Shield: cross-channel spam', count: 14 },
      { reason: 'Fake Nitro giveaway links', count: 11 },
      { reason: 'bit.ly / shortener links', count: 8 },
      { reason: 'Phishing domains', count: 6 },
    ] };
}

const ROUTES: [RegExp, (u: string, init?: RequestInit) => unknown][] = [
  [/\/api\/auth\/session/, () => ({ user: { name: 'tadanosenshi', id: 'demo-admin', image: null }, expires: '2099-01-01T00:00:00.000Z' })],
  [/\/api\/me\/flags/, () => ({ tourSeen: true, votePromptSeen: true })],
  [/\/api\/me\/dev/, () => ({ status: 'approved' })],
  [/\/api\/notifications/, () => ({ notifications: [], unread: 0, seenAt: 0 })],
  [/\/discord-info$/, () => ({ id: GID, name: 'Norecoil Community', icon: 'c740802a6db85191056d9e5135fc0d7d' })],
  [/\/api\/guild\/[^/]+\/stats$/, () => ({ totalWarnings: 348, warnedUsers: 57, kickThreshold: 5, banThreshold: 8,
    topWarned: [
      { userId: '480734480072114177', warnings: 4, reasons: SETTINGS.warn['480734480072114177'].reason },
      { userId: '223832988311617536', warnings: 2, reasons: SETTINGS.warn['223832988311617536'].reason },
      { userId: '997020812345678901', warnings: 1, reasons: SETTINGS.warn['997020812345678901'].reason },
    ] })],
  [/\/actions$/, () => actions()],
  [/\/audit$/, () => ({ entries: [
    { userId: 'demo-admin', username: 'tadanosenshi', path: 'protect.malware', description: 'Enabled Malware / Phishing blocker', timestamp: NOW() - 8600 },
    { userId: 'demo-admin', username: 'tadanosenshi', path: 'preset', description: 'Applied preset: Balanced', timestamp: NOW() - 86400 * 2 },
    { userId: 'demo-admin', username: 'tadanosenshi', path: 'lockdown', description: '✅ Lockdown lifted', timestamp: NOW() - 86400 * 3 },
  ] })],
  [/\/trends\?days=(\d+)/, (u) => trends(Math.min(30, parseInt(u.match(/days=(\d+)/)![1], 10) || 14))],
  [/\/lockdown$/, () => ({ active: false, since: 0, by: null, reason: null, channelsLimited: 0 })],
  [/\/permfails$/, () => ({ items: [], dismissedAt: 0 })],
  [/\/verify\/health/, () => ({ ok: false, checks: [
    { id: 'role', ok: true, label: 'Quarantine role exists', detail: '@Unverified' },
    { id: 'rank', ok: true, label: 'Bot role above quarantine role', detail: '' },
    { id: 'perm', ok: false, label: 'Manage Roles permission', detail: 'Grant it in Server Settings → Roles' },
  ] })],
  [/\/verify\/stats/, () => ({ total: 128, last7: 23 })],
  [/\/discord-members\/resolve/, (u) => ({ members: (u.match(/ids=([\d,]+)/)?.[1] ?? '').split(',').filter(Boolean)
    .map((id) => ({ id, username: USERS[id] ?? `User …${id.slice(-4)}`, nick: null, avatar: null })) })],
  [/\/discord-channels/, () => ({ channels: [
    { id: '1106', name: 'Community', type: 4 },
    { id: '1101', name: 'mod-log', type: 0, parent_id: '1106' },
    { id: '1103', name: 'general', type: 0, parent_id: '1106' },
    { id: '1104', name: 'announcements', type: 5, parent_id: '1106' },
    { id: '1105', name: 'Voice Lounge', type: 2, parent_id: '1106' },
  ] })],
  [/\/discord-roles/, () => ({ roles: [
    { id: '1108', name: 'Moderator', color: 15844367, position: 5 },
    { id: '1107', name: 'Member', color: 5793266, position: 2 },
    { id: '1102', name: 'Unverified', color: 10070709, position: 1 },
  ] })],
  [/\/scamshield$/, () => ({ flaggedTotal: 12480, flaggedWeek: 214, guildCatches: 9 })],
  [/\/premium$/, () => ({ active: true, until: NOW() + 86400 * 30 })],
  [/\/schedule$/, () => ({ night: { enabled: true, fromHour: 0, toHour: 8, preset: 'strict' }, nightActive: false, eventUntil: 0, premium: true })],
  [/\/watchlist$/, () => ({ premium: true, entries: [
    { userId: '480734480072114177', until: NOW() + 86400 * 5, by: 'tadanosenshi', reason: 'Suspicious link pattern', added: NOW() - 86400 * 2 },
  ] })],
  [/\/deliveries$/, () => ({ deliveries: [
    { id: 3, event: 'link_blocked', status: 200, ok: true, durationMs: 182, createdAt: NOW() - 3600 },
    { id: 2, event: 'scamshield_catch', status: 500, ok: false, durationMs: 420, createdAt: NOW() - 7200 },
    { id: 1, event: 'test', status: 200, ok: true, durationMs: 210, createdAt: NOW() - 86400 },
  ] })],
  [/\/api\/guild\/[^/]+$/, () => SETTINGS],
];

/* ── fetch interception (module scope: runs before any effect) ── */

declare global { interface Window { __lpDemoFetch?: boolean } }

if (typeof window !== 'undefined' && !window.__lpDemoFetch) {
  window.__lpDemoFetch = true;
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/')) {
      for (const [re, handler] of ROUTES) {
        if (re.test(url)) {
          return Promise.resolve(new Response(JSON.stringify(handler(url, init)), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }));
        }
      }
      // Writes (toggles, saves) succeed so the UI feels alive; unknown reads
      // get an empty object instead of hitting the real backend.
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return real(input as RequestInfo, init);
  };
}

export default function DemoPage() {
  return (
    <SessionProvider session={{ user: { name: 'tadanosenshi', id: 'demo-admin', image: null }, expires: '2099-01-01T00:00:00.000Z' } as never}>
      <div style={{ position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 999, padding: '6px 14px', borderRadius: 99, background: 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.45)', color: '#96a4ff', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(8px)', pointerEvents: 'none' }}>
        REDESIGN PREVIEW · demo data — nothing is saved
      </div>
      <GuildDashboard />
    </SessionProvider>
  );
}
