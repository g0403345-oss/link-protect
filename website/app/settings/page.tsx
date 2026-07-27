'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Clock, CheckCircle2, XCircle, Send, RefreshCw, User, Trophy, Gem, Bell,
  Smartphone, MessageSquare, Database, Download, Trash2, ExternalLink, Lock,
  Settings2, ShieldAlert, ShieldOff, Bug,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import ToggleSwitch from '@/components/ToggleSwitch';
import ReportThread from '@/components/ReportThread';
import { SupporterBadge, StreakChip, levelInfo, MILESTONES, VOTE_URL } from '@/components/SupporterBadge';
import { APP_STORE_URL } from '@/lib/discord';
import type {
  DevStatus, VoterProfile, PremiumBatchEntry, NotifPrefs, ConnectedDevice,
  DevicePrefs, AccountReport,
} from '@/lib/db';
import type { EnrichedGuild } from '@/app/api/guilds/route';

/* ── shared bits ────────────────────────────────────────────── */

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Code2; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon size={14} color="#5865f2" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>{title}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function LoadingLine({ text = 'Loading…' }: { text?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#52535a', fontSize: 13 }}>
      <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> {text}
    </div>
  );
}

/* Toast stack — same small pattern as the guild dashboard. */
interface Toast { id: number; type: 'success' | 'error'; message: string; }
let toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, addToast };
}

type AddToast = (type: 'success' | 'error', message: string) => void;

function fmt(sec: number) {
  if (sec <= 0) return 'now';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/* ── 1 · Voter profile ──────────────────────────────────────── */

function VoterCard() {
  const [v, setV] = useState<VoterProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    fetch('/api/me/voter')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d && !d.error) setV(d as VoterProfile); else setFailed(true); })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (failed) return <p style={{ fontSize: 13, color: '#52535a' }}>Voting stats are unavailable right now — check back in a bit.</p>;
  if (!v) return <LoadingLine text="Loading your voter profile…" />;

  const total = v.total ?? 0;
  const streak = v.streak ?? 0;
  const lv = levelInfo(total);
  const nextTier = lv.next ? MILESTONES.find((m) => m.at === lv.next)?.tier : null;
  const inCooldown = v.hasVoted && now < v.canVoteAt;
  // The streak survives as long as a vote lands within ~24h of the cooldown
  // opening again — canVoteAt-based, same clock the banner countdown uses.
  const streakExpiresIn = v.canVoteAt + 86400 - now;

  return (
    <div>
      {/* Level + XP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: `${lv.color}1a`, border: `1px solid ${lv.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: lv.color, letterSpacing: '0.02em' }}>
          LV{lv.level}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: '#f2f3f5' }}>{lv.name}</span>
            {v.supporter && <SupporterBadge total={total} />}
            <StreakChip streak={streak} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#2e2e36', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(3, Math.round(lv.progress * 100))}%`, height: '100%', borderRadius: 3, background: lv.color, transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6d6f78', whiteSpace: 'nowrap' }}>
              {lv.next ? `${total}/${lv.next}` : 'MAX'}
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: '#52535a', marginTop: 4 }}>
            {lv.next && nextTier
              ? `${lv.next - total} more ${lv.next - total === 1 ? 'vote' : 'votes'} to ${nextTier}`
              : 'Max level — thank you for the support'}
          </p>
        </div>
        {inCooldown ? (
          <button disabled title="You already voted — come back when the cooldown ends"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: '#18181b', color: '#6d6f78', border: '1px solid #2e2e36', borderRadius: 9, cursor: 'default', whiteSpace: 'nowrap' }}>
            <Clock size={13} /> Vote in {fmt(v.canVoteAt - now)}
          </button>
        ) : (
          <a href={VOTE_URL} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 9, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(88,101,242,0.35)' }}>
            Vote on top.gg <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Stat chips */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {streak >= 1 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', fontSize: 12, fontWeight: 600, color: '#ff922b', background: 'rgba(255,146,43,0.1)', border: '1px solid rgba(255,146,43,0.3)', borderRadius: 99 }}>
            🔥 {streak}-day streak
            <span style={{ color: '#6d6f78', fontWeight: 500 }}>
              {streakExpiresIn > 0 ? `· expires in ${fmt(streakExpiresIn)}` : '· expiring — vote now!'}
            </span>
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', fontSize: 12, fontWeight: 600, color: '#b5bac1', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 99 }}>
          {v.monthly ?? 0} {v.monthly === 1 ? 'vote' : 'votes'} this month
        </span>
        {v.rank != null && v.rank > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', fontSize: 12, fontWeight: 700, color: '#96a4ff', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.3)', borderRadius: 99 }}>
            <Trophy size={12} /> #{v.rank} this month
          </span>
        )}
      </div>

      {/* Milestone badges — reached vs. locked */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 14 }}>
        {[...MILESTONES].reverse().map((m) => {
          const reached = total >= m.at;
          return (
            <div key={m.tier}
              title={reached ? `${m.tier} — reached with ${m.at} lifetime votes` : `${m.tier} unlocks at ${m.at} lifetime votes`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, background: reached ? m.bg : '#18181b', border: `1px solid ${reached ? `${m.color}55` : '#2e2e36'}`, opacity: reached ? 1 : 0.7 }}>
              {reached
                ? <CheckCircle2 size={14} color={m.color} style={{ flexShrink: 0 }} />
                : <Lock size={13} color="#52535a" style={{ flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: reached ? m.color : '#949ba4' }}>{m.tier}</div>
                <div style={{ fontSize: 10.5, color: '#52535a' }}>{reached ? `${m.at}+ votes` : `at ${m.at} votes`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 2 · Premium overview ───────────────────────────────────── */

function PremiumOverview({ onToast }: { onToast: AddToast }) {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [guilds, setGuilds] = useState<EnrichedGuild[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PremiumBatchEntry>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Same source as the dashboard list — cached copy first, network otherwise.
        let list: EnrichedGuild[] | null = null;
        try {
          const cached = sessionStorage.getItem('lp_guilds_v1');
          if (cached) list = JSON.parse(cached) as EnrichedGuild[];
        } catch { /* corrupt cache — fetch fresh */ }
        if (!list) {
          const r = await fetch('/api/guilds');
          if (!r.ok) throw new Error();
          list = (await r.json()) as EnrichedGuild[];
        }
        const bots = list.filter((g) => g.botPresent);
        if (!alive) return;
        setGuilds(bots);
        if (bots.length) {
          const r2 = await fetch('/api/premium/batch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: bots.map((g) => g.id) }),
          });
          const d = r2.ok ? await r2.json() : null;
          if (alive && d?.statuses) setStatuses(d.statuses as Record<string, PremiumBatchEntry>);
        }
        if (alive) setState('ready');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, []);

  const openPortal = async (guildId: string) => {
    setBusyId(guildId);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guildId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error();
      window.location.href = d.url;
    } catch {
      onToast('error', 'Could not open Stripe — try again');
      setBusyId(null);
    }
  };

  if (state === 'loading') return <LoadingLine text="Checking your servers…" />;
  if (state === 'error') return <p style={{ fontSize: 13, color: '#52535a' }}>Couldn&rsquo;t load your servers right now.</p>;
  if (guilds.length === 0) return <p style={{ fontSize: 13, color: '#52535a' }}>No protected servers yet — add Link Protect to a server first.</p>;

  const withPremium = guilds.filter((g) => statuses[g.id]?.active);
  const withoutCount = guilds.length - withPremium.length;

  if (withPremium.length === 0) {
    return (
      <p style={{ fontSize: 13, color: '#52535a' }}>
        None of your {guilds.length === 1 ? 'server has' : `${guilds.length} servers have`} Premium — you can upgrade any time from a server&rsquo;s Overview.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {withPremium.map((g) => {
        const st = statuses[g.id];
        return (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 9, background: 'linear-gradient(135deg, rgba(88,101,242,0.08), rgba(235,69,158,0.04))', border: '1px solid rgba(88,101,242,0.3)' }}>
            <Gem size={15} color="#96a4ff" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              {st.until ? (
                <span style={{ fontSize: 11.5, color: '#6d6f78' }}>
                  renews {new Date(st.until * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              ) : (
                <span style={{ fontSize: 11.5, color: '#6d6f78' }}>active</span>
              )}
            </div>
            <button onClick={() => openPortal(g.id)} disabled={busyId !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#b5bac1', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer', opacity: busyId === g.id ? 0.6 : 1, flexShrink: 0 }}>
              {busyId === g.id ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Settings2 size={12} />} Manage
            </button>
          </div>
        );
      })}
      {withoutCount > 0 && (
        <p style={{ fontSize: 12, color: '#52535a', marginTop: 2 }}>
          {withoutCount} {withoutCount === 1 ? 'server' : 'servers'} without Premium — upgrade from any server&rsquo;s Overview.
        </p>
      )}
    </div>
  );
}

/* ── 3 · Notifications ──────────────────────────────────────── */

const NOTIF_ROWS: { key: keyof NotifPrefs; label: string; description: string }[] = [
  { key: 'reports', label: 'Reports & replies', description: 'Replies and status changes on your tickets' },
  { key: 'developer', label: 'Developer news', description: 'Decisions and updates about your developer access' },
  { key: 'warnings', label: 'Warnings', description: 'When you receive a warning on a server' },
  { key: 'settings', label: 'Settings changes', description: 'When settings change on servers you manage' },
];

function NotificationPrefs({ onToast }: { onToast: AddToast }) {
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/me/notifprefs')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d && !d.error) setPrefs(d as NotifPrefs); else setFailed(true); })
      .catch(() => setFailed(true));
  }, []);

  const toggle = (key: keyof NotifPrefs, value: boolean) => {
    if (!prefs) return;
    const prev = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic
    fetch('/api/me/notifprefs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
    })
      .then((r) => { if (!r.ok) throw new Error(); onToast('success', 'Notification preferences saved'); })
      .catch(() => { setPrefs(prev); onToast('error', 'Could not save — try again'); });
  };

  if (failed) return <p style={{ fontSize: 13, color: '#52535a' }}>Notification preferences are unavailable right now.</p>;
  if (!prefs) return <LoadingLine />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {NOTIF_ROWS.map((row) => (
        <ToggleSwitch key={row.key} checked={prefs[row.key]} onChange={(c) => toggle(row.key, c)}
          label={row.label} description={row.description} />
      ))}
    </div>
  );
}

/* ── 4 · Connected devices ──────────────────────────────────── */

const DEVICE_PREFS: { key: keyof DevicePrefs; label: string }[] = [
  { key: 'bot_offline', label: 'Bot offline' },
  { key: 'rule_triggered', label: 'Rule triggered' },
  { key: 'settings_changed', label: 'Settings changed' },
  { key: 'scam_shield', label: 'Scam Shield' },
];

function platformLabel(platform: string): string {
  const p = platform.toLowerCase();
  if (p === 'ios' || p === 'iphone') return 'iPhone';
  if (p === 'ipados' || p === 'ipad') return 'iPad';
  if (p === 'android') return 'Android';
  return platform ? platform[0].toUpperCase() + platform.slice(1) : 'Device';
}

/* Compact "Download on the App Store" badge (same link as the landing page). */
function AppStoreBadge() {
  return (
    <a href={APP_STORE_URL} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 14px', background: '#000', border: '1px solid #2e2e36', borderRadius: 10, textDecoration: 'none' }}>
      <svg width="18" height="18" viewBox="0 0 384 512" fill="#fff" aria-hidden="true">
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 9, color: '#b5bac1', fontWeight: 500 }}>Download on the</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>App Store</span>
      </span>
    </a>
  );
}

function ConnectedDevices({ onToast }: { onToast: AddToast }) {
  const [devices, setDevices] = useState<ConnectedDevice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmTail, setConfirmTail] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetch('/api/me/devices')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d && Array.isArray(d.devices)) setDevices(d.devices as ConnectedDevice[]); else setFailed(true); })
      .catch(() => setFailed(true));
  }, []);

  const togglePref = (tail: string, key: keyof DevicePrefs, value: boolean) => {
    if (!devices) return;
    const prev = devices;
    setDevices(devices.map((d) => (d.tail === tail ? { ...d, prefs: { ...d.prefs, [key]: value } } : d)));
    fetch('/api/me/devices/prefs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tail, key, value }),
    })
      .then((r) => { if (!r.ok) throw new Error(); onToast('success', 'Saved'); })
      .catch(() => { setDevices(prev); onToast('error', 'Could not save — try again'); });
  };

  const remove = async (tail: string) => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/me/devices/${encodeURIComponent(tail)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setDevices((d) => (d ?? []).filter((x) => x.tail !== tail));
      setConfirmTail(null);
      onToast('success', 'Device removed');
    } catch {
      onToast('error', 'Could not remove the device');
    } finally {
      setRemoving(false);
    }
  };

  if (failed) return <p style={{ fontSize: 13, color: '#52535a' }}>Device list is unavailable right now.</p>;
  if (!devices) return <LoadingLine text="Loading your devices…" />;

  if (devices.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
        <Smartphone size={26} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13.5, fontWeight: 600, color: '#949ba4', marginBottom: 4 }}>No app connected yet</p>
        <p style={{ fontSize: 12, color: '#52535a', marginBottom: 14 }}>
          Get the Link Protect app to manage your servers and receive push alerts on the go.
        </p>
        <AppStoreBadge />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {devices.map((d) => (
        <div key={d.tail} style={{ border: '1px solid #1e1e22', borderRadius: 9, padding: '12px 14px', background: '#0d0d10' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(88,101,242,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Smartphone size={15} color="#96a4ff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f2f3f5' }}>{platformLabel(d.platform)}</div>
              <div style={{ fontSize: 11.5, color: '#52535a' }}>
                updated {relTime(d.updatedAt)} · {d.guildCount} {d.guildCount === 1 ? 'server' : 'servers'}
              </div>
            </div>
            {confirmTail === d.tail ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11.5, color: '#949ba4' }}>Remove?</span>
                <button onClick={() => remove(d.tail)} disabled={removing}
                  style={{ padding: '5px 10px', fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#f23f43', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: removing ? 0.6 : 1 }}>
                  Yes
                </button>
                <button onClick={() => setConfirmTail(null)} disabled={removing}
                  style={{ padding: '5px 10px', fontSize: 11.5, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 6, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmTail(d.tail)} title="Disconnect this device"
                style={{ width: 30, height: 30, borderRadius: 7, background: 'transparent', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#6d6f78' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f23f43'; e.currentTarget.style.borderColor = 'rgba(242,63,67,0.4)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#6d6f78'; e.currentTarget.style.borderColor = '#2e2e36'; }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10, paddingTop: 10, borderTop: '1px solid #1a1a1e' }}>
            {DEVICE_PREFS.map((p) => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <ToggleSwitch size="sm" checked={!!d.prefs?.[p.key]} onChange={(c) => togglePref(d.tail, p.key, c)} />
                <span style={{ fontSize: 11.5, color: '#949ba4' }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 5 · My tickets & reports ───────────────────────────────── */

const TYPE_META: Record<string, { label: string; color: string; icon: typeof Bug }> = {
  malicious_link: { label: 'Malicious link', color: '#f23f43', icon: ShieldAlert },
  false_positive: { label: 'False positive', color: '#f0b232', icon: ShieldOff },
  bug: { label: 'Bug', color: '#eb459e', icon: Bug },
  feedback: { label: 'Feedback', color: '#5865f2', icon: MessageSquare },
  appeal: { label: 'Appeal', color: '#23a55a', icon: ShieldOff },
};

const STATUS_COLOR: Record<string, string> = {
  open: '#f0b232', reviewed: '#5865f2', resolved: '#23a55a', dismissed: '#52535a',
};

function MyReports() {
  const [reports, setReports] = useState<AccountReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch('/api/me/reports')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d && Array.isArray(d.reports)) setReports(d.reports as AccountReport[]); else setFailed(true); })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (failed) return <p style={{ fontSize: 13, color: '#52535a' }}>Your reports are unavailable right now.</p>;
  if (!reports) return <LoadingLine text="Loading your reports…" />;

  if (reports.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
        <MessageSquare size={24} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, color: '#52535a' }}>No tickets yet — reports you submit show up here with their replies.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reports.map((r) => {
          const m = TYPE_META[r.type] ?? TYPE_META.feedback;
          const excerpt = r.url ?? r.message ?? '';
          return (
            <button key={r.id} onClick={() => setOpenId(r.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: '#0d0d10', border: '1px solid #1e1e22', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.13s' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e1e22')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}33`, padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>
                  <m.icon size={11} /> {m.label}
                </span>
                {r.category && <span style={{ fontSize: 11, color: '#6d6f78' }}>{r.category}</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[r.status] ?? '#52535a', textTransform: 'capitalize' }}>{r.status}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#52535a', flexShrink: 0 }}>{relTime(r.created_at)}</span>
              </div>
              {excerpt && (
                <div style={{ fontSize: 12.5, color: '#949ba4', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: r.url ? 'monospace' : 'inherit' }}>
                  {excerpt.length > 120 ? `${excerpt.slice(0, 120)}…` : excerpt}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {openId !== null && (
        <ReportThread reportId={openId} viewerIsAdmin={false}
          onClose={() => { setOpenId(null); load(); }} onChanged={load} />
      )}
    </>
  );
}

/* ── 6 · Data & privacy ─────────────────────────────────────── */

function DataPrivacy({ onToast }: { onToast: AddToast }) {
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/me/export');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'linkprotect-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onToast('success', 'Your data export is downloading');
    } catch {
      onToast('error', 'Export failed — try again');
    } finally {
      setDownloading(false);
    }
  };

  const wipe = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/me/data', { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error();
      onToast('success', 'Your data has been deleted');
      setTimeout(() => window.location.reload(), 1400);
    } catch {
      onToast('error', 'Deletion failed — try again');
      setDeleting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={download} disabled={downloading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#f2f3f5', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', opacity: downloading ? 0.6 : 1 }}>
          {downloading ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
          Download my data
        </button>
        {!confirming && (
          <button onClick={() => setConfirming(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: '#f23f43', background: 'rgba(242,63,67,0.06)', border: '1px solid rgba(242,63,67,0.3)', borderRadius: 8, cursor: 'pointer' }}>
            <Trash2 size={13} /> Delete my data
          </button>
        )}
      </div>

      {confirming && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(242,63,67,0.06)', border: '1px solid rgba(242,63,67,0.25)', borderRadius: 9 }}>
          <p style={{ fontSize: 12.5, color: '#dbdee1', lineHeight: 1.55, marginBottom: 10 }}>
            This permanently deletes your <b>votes &amp; streak</b>, <b>reports &amp; tickets</b>,{' '}
            <b>notifications</b>, <b>connected devices</b> and <b>developer access</b>. It cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={wipe} disabled={deleting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#f23f43', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>
              {deleting ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
              Yes, delete everything
            </button>
            <button onClick={() => setConfirming(false)} disabled={deleting}
              style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: '#52535a', marginTop: 12 }}>
        Server settings are stored per server and are unaffected by either action.
      </p>
    </div>
  );
}

/* ── page ───────────────────────────────────────────────────── */

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toasts, addToast } = useToast();
  const [dev, setDev] = useState<DevStatus | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/me/dev')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setDev(d as DevStatus); })
      .catch(() => {});
  }, [status]);

  const apply = async () => {
    if (sending) return;
    setSending(true); setError(null);
    try {
      const res = await fetch('/api/me/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Request failed — please try again.'); }
      else { setDev(d as DevStatus); setMessage(''); }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSending(false);
    }
  };

  if (status !== 'authenticated') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid #5865f2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 60 }}>
      <Navbar />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 96px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em', marginBottom: 4 }}>Settings</h1>
          <p style={{ fontSize: 13, color: '#52535a' }}>Your account, perks and preferences</p>
        </div>

        <Card title="Account" icon={User}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {session.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" style={{ width: 44, height: 44, borderRadius: '50%' }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: '#fff' }}>
                {session.user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5' }}>{session.user?.name}</div>
              <div style={{ fontSize: 12, color: '#52535a', fontFamily: 'monospace' }}>{session.user?.id}</div>
            </div>
          </div>
        </Card>

        <Card title="Voter Profile" icon={Trophy}>
          <VoterCard />
        </Card>

        <Card title="Premium" icon={Gem}>
          <PremiumOverview onToast={addToast} />
        </Card>

        <Card title="Notifications" icon={Bell}>
          <NotificationPrefs onToast={addToast} />
        </Card>

        <Card title="Connected Devices" icon={Smartphone}>
          <ConnectedDevices onToast={addToast} />
        </Card>

        <Card title="My Tickets & Reports" icon={MessageSquare}>
          <MyReports />
        </Card>

        <Card title="Data & Privacy" icon={Database}>
          <DataPrivacy onToast={addToast} />
        </Card>

        <Card title="Developer Access" icon={Code2}>
          <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.6, marginBottom: 14 }}>
            Developer access unlocks the <b style={{ color: '#f2f3f5' }}>Developer tab</b> in your server
            dashboards — starting with the embeddable live &ldquo;Protected by Link Protect&rdquo; badge for
            your website or GitHub README, with more integrations to come. Requests are reviewed
            manually; you&rsquo;ll get a notification here once yours is decided.
          </p>

          {!dev ? (
            <LoadingLine text="Loading status…" />
          ) : dev.status === 'approved' ? (
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(35,165,90,0.07)', border: '1px solid rgba(35,165,90,0.25)', borderRadius: 8 }}>
              <CheckCircle2 size={16} color="#23a55a" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#23a55a', marginBottom: 3 }}>You&rsquo;re a developer</div>
                <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>
                  Open any server dashboard and look for the <b>Developer</b> tab in the sidebar.
                </p>
              </div>
            </div>
          ) : dev.status === 'pending' ? (
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(240,178,50,0.07)', border: '1px solid rgba(240,178,50,0.25)', borderRadius: 8 }}>
              <Clock size={16} color="#f0b232" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f0b232', marginBottom: 3 }}>Request pending</div>
                <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>
                  Your request is being reviewed — you&rsquo;ll get a bell notification as soon as it&rsquo;s decided.
                </p>
              </div>
            </div>
          ) : (
            <>
              {dev.status === 'denied' && (
                <div style={{ display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 14, background: 'rgba(242,63,67,0.06)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 8 }}>
                  <XCircle size={16} color="#f23f43" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>
                    Your previous request wasn&rsquo;t approved. You&rsquo;re welcome to apply again — a short
                    note about what you&rsquo;re building helps.
                  </p>
                </div>
              )}
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>
                What do you want to build? <span style={{ color: '#52535a', fontWeight: 400 }}>(optional, but helps)</span>
              </label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3}
                placeholder="e.g. I want to embed the protection badge on our community website…"
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}
              />
              {error && <p style={{ fontSize: 12.5, color: '#f23f43', marginBottom: 10 }}>{error}</p>}
              <button onClick={apply} disabled={sending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
                {sending ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                Request developer access
              </button>
            </>
          )}
        </Card>
      </div>

      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#18181b', border: `1px solid ${t.type === 'success' ? 'rgba(35,165,90,0.3)' : 'rgba(242,63,67,0.3)'}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', pointerEvents: 'auto' }}>
              {t.type === 'success' ? <CheckCircle2 size={14} color="#23a55a" /> : <XCircle size={14} color="#f23f43" />}
              <span style={{ fontSize: 13, color: '#f2f3f5' }}>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
