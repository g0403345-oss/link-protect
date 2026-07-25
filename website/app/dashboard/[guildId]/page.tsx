'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, AlertTriangle, Lock, List, BarChart3,
  ChevronLeft, Save, CheckCircle2, XCircle, RefreshCw,
  EyeOff, Users, TrendingUp, Ban, Clock, Trash2, Plus, X, Info, Activity,
  Hourglass, Target, History, HelpCircle, UserX, ShieldAlert, Globe, LogIn, Radar, Code2, UserCheck, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import ToggleSwitch from '@/components/ToggleSwitch';
import PickerList from '@/components/PickerList';
import ChannelRules from '@/components/ChannelRules';
import TrendsChart from '@/components/TrendsChart';
import TeamAccess from '@/components/TeamAccess';
import WarnLogConfig from '@/components/WarnLogConfig';
import MemberModeration from '@/components/MemberModeration';
import DashboardTour from '@/components/DashboardTour';
import SecurityScore from '@/components/SecurityScore';
import DeveloperPanel from '@/components/DeveloperPanel';
import PresetsCard from '@/components/PresetsCard';
import CollapsibleCard, { cardKey } from '@/components/CollapsibleCard';
import LockdownControl from '@/components/LockdownCard';
import VerificationTab from '@/components/VerificationTab';
import MessagesTab from '@/components/MessagesTab';
import { useGuildTint } from '@/components/fx';
import ReportForm from '@/components/ReportForm';
import VoteBanner from '@/components/VoteBanner';
import PermFailBanner from '@/components/PermFailBanner';
import GuildHero from '@/components/GuildHero';
import PulseStrip from '@/components/PulseStrip';
import BlockerWall from '@/components/BlockerWall';
import ActivityTimeline from '@/components/ActivityTimeline';
import EmptyState from '@/components/EmptyState';

import VotePromo from '@/components/VotePromo';
import type { ServerData, GuildStats } from '@/lib/db';
import Navbar from '@/components/Navbar';

type Section = 'overview' | 'blockers' | 'scamshield' | 'verification' | 'warnings' | 'channelrules' | 'access' | 'messages' | 'blacklist' | 'stats' | 'log' | 'audit' | 'developer';

interface ScamShieldStats { flaggedTotal: number; flaggedWeek: number; guildCatches: number; }

interface GuildAction {
  user_id: string; username: string; channel_id: string;
  action: 'warned' | 'kicked' | 'banned' | 'timeout' | 'unwarned';
  reason: string; warn_count: number; timestamp: number;
}

interface AuditEntry {
  userId: string; username: string | null; path: string; description: string; timestamp: number;
}

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

/* ── sub-components ────────────────────────────────────────── */

function Card({ title, children, tourId }: { title: string; children: React.ReactNode; tourId?: string }) {
  return (
    <CollapsibleCard title={title} tourId={tourId} storageKey={cardKey('guild', title)}>
      {children}
    </CollapsibleCard>
  );
}

function StatCard({ label, value, icon: Icon, color, spark, delta }: {
  label: string; value: number | string; icon: typeof Shield; color: string;
  /** Optional mini-trend rendered as a watermark + "+N this week" chip. */
  spark?: number[]; delta?: number | null;
}) {
  const max = spark?.length ? Math.max(1, ...spark) : 1;
  return (
    <div style={{ position: 'relative', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: '14px 16px', overflow: 'hidden' }}>
      {spark && spark.length > 1 && (
        <svg aria-hidden viewBox={`0 0 ${spark.length - 1} 10`} preserveAspectRatio="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: 34, opacity: 0.6 }}>
          <polygon fill={`${color}14`}
            points={`0,10 ${spark.map((v, i) => `${i},${10 - (v / max) * 8.5}`).join(' ')} ${spark.length - 1},10`} />
        </svg>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span style={{ fontSize: 12, color: '#52535a', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: '-0.02em' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {typeof delta === 'number' && delta !== 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? '#f0b232' : '#23a55a' }}>
            {delta > 0 ? `+${delta}` : delta} this week {delta > 0 ? '↑' : '↓'}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Shield }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon size={16} color="#5865f2" />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em' }}>{title}</h2>
      </div>
      <p style={{ fontSize: 13, color: '#52535a' }}>{description}</p>
    </div>
  );
}

function NumberInput({ label, description, value, icon, color, onSave, saving }: {
  label: string; description: string; value: number; icon: React.ReactNode;
  color: string; onSave: (v: number) => void; saving: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const dirty = local !== value;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {icon}
        <label style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>{label}</label>
      </div>
      <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>{description}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min={0} value={local}
          onChange={(e) => setLocal(Math.max(0, parseInt(e.target.value) || 0))}
          style={{ width: 80, padding: '8px 10px', background: '#18181b', border: `1px solid ${dirty ? color : '#2e2e36'}`, borderRadius: 7, color: '#f2f3f5', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'inherit', MozAppearance: 'textfield' }}
        />
        {dirty && (
          <button onClick={() => onSave(local)} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, background: color, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
            Save
          </button>
        )}
      </div>
    </div>
  );
}


function SegmentPicker({ options, value, onChange, disabled }: {
  options: { id: string; label: string; color?: string }[];
  value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: 'inline-flex', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(({ id, label, color }) => {
        const active = value === id;
        const c = color ?? '#5865f2';
        return (
          <button key={id} onClick={() => !disabled && onChange(id)} disabled={disabled}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6, cursor: disabled ? 'default' : 'pointer', background: active ? `${c}26` : 'transparent', color: active ? c : '#6d6f78', transition: 'all 0.12s' }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}


/* ── main ──────────────────────────────────────────────────── */

export default function GuildDashboard() {
  const params = useParams<{ guildId: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const guildId = params.guildId;

  const [section, setSection] = useState<Section>('overview');
  const mainRef = useRef<HTMLElement>(null);
  // Switch tab AND jump to the top: the content area scrolls on its own, so a
  // plain setSection left you at the previous scroll offset (looked like a
  // random jump). Reset both the content container and the window.
  const selectSection = useCallback((id: Section) => {
    setSection(id);
    if (id === 'log') {
      // Mark the activity log as read — clears the sidebar "new" badge.
      const now = Math.floor(Date.now() / 1000);
      setLogSeenTs(now);
      try { localStorage.setItem(`lp_logseen_${guildId}`, String(now)); } catch { /* ignore */ }
    }
    requestAnimationFrame(() => {
      mainRef.current?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    });
  }, []);
  const [selectedUser, setSelectedUser] = useState<{ id: string; warns: number; reasons: string[] } | null>(null);
  const [modalBusy, setModalBusy] = useState<string | null>(null);
  const [modalConfirm, setModalConfirm] = useState<string | null>(null);
  const [data, setData] = useState<ServerData | null>(null);
  const [stats, setStats] = useState<GuildStats | null>(null);
  const [guildInfo, setGuildInfo] = useState<{ name: string; icon: string | null } | null>(null);
  const [actions, setActions] = useState<GuildAction[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [shieldStats, setShieldStats] = useState<ScamShieldStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ membersScanned: number; eligible: number; removed: number; failed: number; action: string; capped?: boolean; cap?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newLink, setNewLink] = useState('');
  const [newAllow, setNewAllow] = useState('');
  const { toasts, addToast } = useToast();
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [tourRun, setTourRun] = useState(false);
  const tourChecked = useRef(false);
  // Tour completion is stored per Discord account (server-side) so it follows
  // the user across devices and re-logins, not just this browser's localStorage.
  const [flagsReady, setFlagsReady] = useState(false);
  const tourSeenRemote = useRef(false);
  // Vote popup: per-account "don't show again" flag + suppression while the
  // tour is (or was) running this visit — never stack the two overlays.
  const votePromptSeenRemote = useRef(false);
  const votePromoBlocked = useRef(false);
  // Approved developers get the extra Developer tab (badge embed etc.).
  const [devApproved, setDevApproved] = useState(false);
  // Subtle per-server accent glow derived from the guild icon's average color.
  const tint = useGuildTint(guildId, guildInfo?.icon);

  // Redesign: 14-day trend (pulse strip + stat sparkline), verify-health badge
  // and the "new log entries since last visit" counter.
  const [trend14, setTrend14] = useState<number[] | null>(null);
  const [verifyIssue, setVerifyIssue] = useState(false);
  const [logSeenTs, setLogSeenTs] = useState(0);
  useEffect(() => {
    fetch(`/api/guild/${guildId}/trends?days=14`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.perDay) setTrend14((d.perDay as { count: number }[]).map((x) => x.count)); })
      .catch(() => {});
  }, [guildId]);
  useEffect(() => {
    try { setLogSeenTs(parseInt(localStorage.getItem(`lp_logseen_${guildId}`) ?? '0') || 0); } catch { /* ignore */ }
  }, [guildId]);
  useEffect(() => {
    if (!data?.verify?.enabled) { setVerifyIssue(false); return; }
    fetch(`/api/guild/${guildId}/verify/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVerifyIssue(d ? !d.ok : false))
      .catch(() => {});
  }, [guildId, data]);

  const closeTour = useCallback(() => {
    setTourRun(false);
    tourSeenRemote.current = true;
    try { localStorage.setItem('lp_tour_v1', '1'); } catch { /* ignore */ }
    fetch('/api/me/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourSeen: true }),
    }).catch(() => { /* best-effort — localStorage still covers this browser */ });
  }, []);

  // Resolve warned-user IDs → Discord names so lists/modals never show raw IDs.
  const resolveUsers = useCallback(async (ids: string[]) => {
    const missing = Array.from(new Set(ids)).filter((id) => id && !(id in userNames));
    if (missing.length === 0) return;
    const map: Record<string, string> = {};
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      try {
        const res = await fetch(`/api/guild/${guildId}/discord-members/resolve?ids=${chunk.join(',')}`);
        if (!res.ok) continue;
        const d = await res.json();
        for (const m of (d.members ?? []) as { id: string; username: string; nick?: string }[]) {
          map[m.id] = m.nick ?? m.username;
        }
      } catch { /* ignore */ }
    }
    if (Object.keys(map).length) setUserNames((prev) => ({ ...prev, ...map }));
  }, [guildId, userNames]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/dashboard');
  }, [status, router]);

  const fetchData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    // Silent refetch (e.g. after saving a channel rule) updates the data in
    // place without flashing the full-page spinner — that flash looked like a
    // page reload after every toggle.
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/guild/${guildId}`);
      if (!res.ok) { if (res.status === 403) { router.push('/dashboard'); return; } throw new Error(); }
      setData(await res.json() as ServerData);
    } catch { if (!silent) addToast('error', 'Failed to load settings'); }
    finally { if (!silent) setLoading(false); }
  }, [guildId, router, addToast]);

  const refreshDataSilently = useCallback(() => { fetchData({ silent: true }); }, [fetchData]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/guild/${guildId}/stats`);
      if (res.ok) setStats(await res.json() as GuildStats);
    } catch { /* silent */ }
  }, [guildId]);

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch(`/api/guild/${guildId}/actions`);
      if (res.ok) { const d = await res.json(); setActions(d.actions ?? []); }
    } catch { /* silent */ }
  }, [guildId]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`/api/guild/${guildId}/audit`);
      if (res.ok) { const d = await res.json(); setAudit(d.entries ?? []); }
    } catch { /* silent */ }
  }, [guildId]);

  const fetchShieldStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/guild/${guildId}/scamshield`);
      if (res.ok) setShieldStats(await res.json() as ScamShieldStats);
    } catch { /* silent */ }
  }, [guildId]);

  const runMemberScan = useCallback(async () => {
    setScanning(true); setScanResult(null);
    try {
      const res = await fetch(`/api/guild/${guildId}/scamshield/scan`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { addToast('error', d?.error ?? 'Scan failed'); return; }
      setScanResult(d);
      if (d.capped) {
        addToast('error', `${d.eligible} flagged members exceed the safety cap — nothing removed. Please review manually.`);
      } else if (d.removed > 0) {
        addToast('success', `Removed ${d.removed} flagged account(s) of ${d.membersScanned.toLocaleString()} scanned`);
        fetchData(); fetchStats();
      } else {
        addToast('success', `Scanned ${d.membersScanned.toLocaleString()} members — none matched the flag database`);
      }
    } catch { addToast('error', 'Could not reach the server'); }
    finally { setScanning(false); }
  }, [guildId, addToast, fetchData, fetchStats]);

  useEffect(() => {
    fetch(`/api/guild/${guildId}/discord-info`)
      .then(r => r.json()).then(d => setGuildInfo(d)).catch(() => {});
  }, [guildId]);

  useEffect(() => { if (status === 'authenticated') { fetchData(); fetchStats(); fetchActions(); } }, [status, fetchData, fetchStats, fetchActions]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/me/dev')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDevApproved(d?.status === 'approved'))
      .catch(() => {});
  }, [status]);

  // Load the per-account "tour seen" flag before deciding whether to auto-launch.
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/me/flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.tourSeen) tourSeenRemote.current = true;
        if (d?.votePromptSeen) votePromptSeenRemote.current = true;
      })
      .catch(() => { /* fall back to localStorage */ })
      .finally(() => setFlagsReady(true));
  }, [status]);

  // Auto-launch the guided tour the first time a user opens any server dashboard.
  // Only after both the settings and the account flag have loaded, so a user who
  // finished the tour on another device / browser never sees it again.
  useEffect(() => {
    if (!data || !flagsReady || tourChecked.current) return;
    tourChecked.current = true;
    let seen = tourSeenRemote.current;
    try { if (localStorage.getItem('lp_tour_v1')) seen = true; } catch { /* ignore */ }
    if (!seen) { votePromoBlocked.current = true; setTourRun(true); }
  }, [data, flagsReady]);

  // Resolve names for warned users (settings data) and top-warned (stats).
  useEffect(() => {
    if (!data?.warn) return;
    const ids = Object.keys(data.warn).filter((k) => !['kick', 'ban', 'timeout'].includes(k));
    if (ids.length) resolveUsers(ids);
  }, [data, resolveUsers]);
  useEffect(() => {
    if (stats?.topWarned?.length) resolveUsers(stats.topWarned.map((u) => u.userId));
  }, [stats, resolveUsers]);

  // Auto-refresh actions every 5 s when the log tab is active
  useEffect(() => {
    if (section !== 'log') return;
    const id = setInterval(fetchActions, 5000);
    return () => clearInterval(id);
  }, [section, fetchActions]);

  // Load the audit log when its tab opens
  useEffect(() => { if (section === 'audit') fetchAudit(); }, [section, fetchAudit]);

  // Load Scam Shield network stats when its tab opens
  useEffect(() => { if (section === 'scamshield') fetchShieldStats(); }, [section, fetchShieldStats]);

  const patch = useCallback(async (path: string, value: unknown, label?: string) => {
    setSaving(path);
    try {
      const res = await fetch(`/api/guild/${guildId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, value }) });
      if (!res.ok) throw new Error();
      setData((prev) => {
        if (!prev) return prev;
        const u = JSON.parse(JSON.stringify(prev)) as ServerData;
        const keys = path.split('.');
        let cur: Record<string, unknown> = u as unknown as Record<string, unknown>;
        // Create missing intermediate objects — older server data may lack
        // whole branches (e.g. warn.timeout, decay), and walking into an
        // undefined key here used to throw and trip the Next error page.
        for (let i = 0; i < keys.length - 1; i++) {
          if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
          cur = cur[keys[i]] as Record<string, unknown>;
        }
        cur[keys[keys.length - 1]] = value;
        return u;
      });
      addToast('success', label ? `${label} saved` : 'Saved');
    } catch { addToast('error', 'Failed to save'); }
    finally { setSaving(null); }
  }, [guildId, addToast]);

  // Remote moderation: warn / timeout / kick / ban a member straight from the
  // dashboard. Warn escalates per the configured thresholds (server-side).
  const moderate = useCallback(async (
    action: 'warn' | 'timeout' | 'kick' | 'ban',
    userId: string, username?: string, opts?: { reason?: string; minutes?: number },
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/guild/${guildId}/moderate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, username, action, reason: opts?.reason, minutes: opts?.minutes }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { addToast('error', d?.error ?? 'Action failed'); return false; }
      const past = { warn: 'warned', timeout: 'timed out', kick: 'kicked', ban: 'banned' }[action];
      let msg = `${username ?? 'Member'} ${past}`;
      if (d.escalated) msg += ` → ${d.escalated === 'ban' ? 'banned' : d.escalated === 'kick' ? 'kicked' : 'timed out'}`;
      addToast('success', msg);
      if (d.escalationError) addToast('error', `Couldn't escalate: ${d.escalationError}`);
      fetchData(); fetchStats();
      return true;
    } catch { addToast('error', 'Could not reach the server'); return false; }
  }, [guildId, addToast, fetchData, fetchStats]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid #5865f2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#f23f43', marginBottom: 12, fontSize: 14 }}>Could not load server settings</p>
          <Link href="/dashboard" style={{ color: '#5865f2', fontSize: 13 }}>← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const protect = data.protect ?? {};
  const newLogCount = actions.filter((a) => a.timestamp > logSeenTs).length;
  const weekDelta = trend14 && trend14.length >= 14
    ? trend14.slice(-7).reduce((a, b) => a + b, 0) - trend14.slice(0, 7).reduce((a, b) => a + b, 0)
    : null;
  const warn = data.warn ?? {};
  const channel = data.channel ?? { channel: [], category: [], member: [], role: [] };
  const links = data.link?.links ?? [];
  const allow = data.link?.allow ?? [];
  const decay = data.decay ?? { enabled: false, days: 30 };
  const raid = data.raid ?? { enabled: false, threshold: 5, window: 10, timeout_minutes: 60 };
  const scamguard = data.scamguard ?? { enabled: false, channels: 3, window: 10, action: 'ban' as const, timeout_minutes: 60, join_check: false, join_action: 'kick' as const, min_servers: 2 };
  const overrides = data.overrides ?? {};

  // Scam Shield launched 2026-07-16 (members intent approved). The flag stays
  // as a kill switch.
  const SHOW_SCAM_SHIELD = true;

  const NAV: { id: Section; label: string; icon: typeof Shield; desc: string }[] = [
    { id: 'overview',     label: 'Overview',      icon: Shield,        desc: 'Status & summary' },
    { id: 'blockers',     label: 'Link Blockers',  icon: AlertTriangle, desc: 'What gets blocked' },
    ...(SHOW_SCAM_SHIELD ? [{ id: 'scamshield' as Section, label: 'Scam Shield', icon: ShieldAlert, desc: 'Scam spam & known scammers' }] : []),
    { id: 'verification', label: 'Verification',  icon: UserCheck,     desc: 'Join gate & verify page' },
    { id: 'warnings',     label: 'Warnings',       icon: Ban,           desc: 'Kick, ban & decay' },
    { id: 'channelrules', label: 'Channel Rules',  icon: Target,        desc: 'Per-channel behaviour' },
    { id: 'access',       label: 'Access Control', icon: Lock,          desc: 'Whitelist channels & roles' },
    { id: 'messages',     label: 'Messages',       icon: MessageSquare, desc: 'How the bot talks' },
    { id: 'blacklist',    label: 'Blacklist',       icon: List,          desc: 'Custom blocked domains' },
    { id: 'stats',        label: 'Statistics',     icon: BarChart3,     desc: 'Warning history' },
    { id: 'log',          label: 'Activity Log',   icon: Activity,      desc: 'Live moderation feed' },
    { id: 'audit',        label: 'Audit Log',      icon: History,       desc: 'Who changed what' },
    ...(devApproved ? [{ id: 'developer' as Section, label: 'Developer', icon: Code2, desc: 'Badge & embeds' }] : []),
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', paddingTop: 60 }}>
      {/* Server-tinted backdrop — each dashboard subtly takes on its server's color */}
      {tint && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: `radial-gradient(720px circle at 18% -5%, ${tint}1f, transparent 62%), radial-gradient(540px circle at 92% 110%, ${tint}12, transparent 60%)` }} />
      )}
      <Navbar />

      {/* Breadcrumb bar */}
      <div style={{ height: 44, background: '#111113', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 10, position: 'sticky', top: 60, zIndex: 40 }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#52535a', textDecoration: 'none' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f2f3f5')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#52535a')}>
          <ChevronLeft size={13} /> All servers
        </Link>
        <span style={{ color: '#2e2e36' }}>/</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {guildInfo?.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfo.icon}.webp?size=32`} alt=""
              style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 20, height: 20, borderRadius: 6, background: '#5865f2', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>
            {guildInfo?.name ?? 'Server Settings'}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div data-tour="lockdown"><LockdownControl guildId={guildId} onToast={addToast} /></div>
          <ReportForm guildId={guildId} />
          <button onClick={() => setTourRun(true)} title="Take the dashboard tour"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; (e.currentTarget as HTMLElement).style.borderColor = '#5865f2'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#949ba4'; (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; }}>
            <HelpCircle size={13} /> <span className="crumb-btn-label">Tour</span>
          </button>
          <span className="crumb-id" style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace' }}>{guildId}</span>
        </div>
      </div>

      <div className="pulse-strip">
        <PulseStrip guildId={guildId} />
      </div>

      {/* Mobile section tab strip — hidden on desktop, sticky below breadcrumb */}
      <div className="mobile-only" style={{ overflowX: 'auto', gap: 6, padding: '10px 16px', background: '#111113', borderBottom: '1px solid #1e1e22', scrollbarWidth: 'none', position: 'sticky', top: 104, zIndex: 30 }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button key={id} onClick={() => selectSection(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, background: active ? 'rgba(88,101,242,0.15)' : 'transparent', color: active ? '#5865f2' : '#6d6f78', flexShrink: 0, transition: 'all 0.15s' }}>
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <aside data-tour="nav" className="guild-sidebar" style={{ width: 220, background: '#111113', borderRight: '1px solid #1e1e22', flexShrink: 0, position: 'sticky', top: 104, height: 'calc(100vh - 104px)', overflowY: 'auto', padding: '12px 8px' }}>
          {[
            { title: '', ids: ['overview'] },
            { title: 'Protection', ids: ['blockers', 'scamshield', 'verification', 'blacklist'] },
            { title: 'Members', ids: ['warnings', 'channelrules', 'access', 'messages'] },
            { title: 'Insights', ids: ['stats', 'log', 'audit'] },
            { title: 'System', ids: ['developer'] },
          ].map(({ title, ids }) => {
            const items = NAV.filter((n) => (ids as string[]).includes(n.id));
            if (!items.length) return null;
            return (
              <div key={title || 'top'} style={{ marginBottom: 4 }}>
                {title && <div style={{ fontSize: 10.5, fontWeight: 800, color: '#494a52', letterSpacing: '0.09em', textTransform: 'uppercase', padding: '10px 12px 4px' }}>{title}</div>}
                {items.map(({ id, label, icon: Icon, desc }) => {
                  const active = section === id;
                  const badge = id === 'log' && newLogCount > 0 ? String(Math.min(99, newLogCount))
                    : id === 'verification' && verifyIssue ? '!' : null;
                  return (
                    <button key={id} onClick={() => selectSection(id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 2, transition: 'background 0.1s', background: active ? 'rgba(88,101,242,0.12)' : 'transparent', borderLeft: active ? '2px solid #5865f2' : '2px solid transparent' }}>
                      <Icon size={15} color={active ? '#5865f2' : '#52535a'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#f2f3f5' : '#949ba4' }}>{label}</div>
                        <div style={{ fontSize: 11, color: '#52535a', marginTop: 1 }}>{desc}</div>
                      </div>
                      {badge && (
                        <span title={badge === '!' ? 'The permission check found a problem' : `${badge} new entries`}
                          style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 99, background: badge === '!' ? 'rgba(240,178,50,0.15)' : 'rgba(88,101,242,0.15)', color: badge === '!' ? '#f0b232' : '#96a4ff', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>

        {/* Content */}
        <main ref={mainRef} className="guild-main" style={{ flex: 1, padding: '28px 32px' }}>
          <div style={{ marginBottom: 20 }}><VoteBanner /></div>
          <PermFailBanner guildId={guildId} />
          {/* Enter-only animation: with AnimatePresence mode="wait" the next
              section only mounted after the old one's exit finished — a stuck
              exit (seen after collapsing a card) left the tab empty. */}
          <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>

              {/* OVERVIEW */}
              {section === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <GuildHero guildId={guildId} name={guildInfo?.name ?? 'Your server'} icon={guildInfo?.icon}
                    data={data} stats={stats} actions={actions} onNavigate={(sec) => selectSection(sec as Section)} />
                  <div data-tour="overview-stats" className="stats-3col-dashboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <StatCard label="Warnings issued" value={stats?.totalWarnings ?? '—'} icon={AlertTriangle} color="#f0b232" spark={trend14 ?? undefined} delta={weekDelta} />
                    <StatCard label="Users warned" value={stats?.warnedUsers ?? '—'} icon={Users} color="#5865f2" />
                    <StatCard label="Active blockers" value={Object.values(protect).filter(Boolean).length} icon={Shield} color="#23a55a" />
                  </div>
                  <div data-tour="securityscore">
                    <SecurityScore data={data} guildId={guildId} onNavigate={(s) => selectSection(s as Section)} />
                  </div>
                </div>
              )}

              {/* VERIFICATION */}
              {section === 'verification' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Verification Gate" description="New members verify on your personal web page — a hurdle scam bots can't take" icon={UserCheck} />
                  <div data-tour="verification">
                    <VerificationTab guildId={guildId} data={data} patch={patch} saving={saving} guildIcon={guildInfo?.icon} onToast={addToast} onRefresh={refreshDataSilently} />
                  </div>
                </div>
              )}

              {/* DEVELOPER (approved developers only) */}
              {section === 'developer' && devApproved && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Developer" description="API keys, webhooks, embeds and exports for your own website and tools" icon={Code2} />
                  <DeveloperPanel guildId={guildId} onToast={addToast} />
                </div>
              )}

              {/* BLOCKERS */}
              {section === 'blockers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Link Blockers" description="Toggle which types of links are blocked in your server" icon={AlertTriangle} />
                  <div data-tour="presets">
                    <PresetsCard guildId={guildId} onToast={addToast} onApplied={refreshDataSilently} />
                  </div>
                  <Card title="Platform Blockers" tourId="blockers">
                    <BlockerWall
                      protect={protect as Record<string, boolean | undefined>}
                      saving={saving}
                      onToggle={(key, v, label) => patch(`protect.${key}`, v, label)}
                    />
                  </Card>
                  <Card title="Silent Mode" tourId="silent">
                    <ToggleSwitch
                      checked={!!data.silent}
                      onChange={(v) => patch('silent', v, 'Silent mode')}
                      label="Silent Mode"
                      description="Delete links without posting a public warning — user gets a DM instead"
                      disabled={saving === 'silent'}
                    />
                    {data.silent && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 8 }}>
                        <Info size={13} color="#5865f2" style={{ flexShrink: 0, marginTop: 1 }} />
                        <p style={{ fontSize: 12, color: '#6d6f78' }}>Links are deleted silently. Users receive a private DM. Warnings are still tracked internally.</p>
                      </div>
                    )}
                  </Card>
                  <Card title="Raid Protection" tourId="raid">
                    <ToggleSwitch
                      checked={!!raid.enabled}
                      onChange={(v) => patch('raid.enabled', v, 'Raid protection')}
                      label="Auto-defend against raids"
                      description="When many members post the same link within seconds (hijacked accounts / raids), delete them and time out the accounts automatically — one alarm instead of dozens of warnings."
                      disabled={saving === 'raid.enabled'}
                    />
                    {raid.enabled && (
                      <div className="thresholds-3col" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e1e22', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <NumberInput label="Trigger at" description="Distinct members posting the same link" value={raid.threshold ?? 5} icon={<Users size={14} color="#f23f43" />} color="#f23f43" onSave={(v) => patch('raid.threshold', Math.max(2, v), 'Raid threshold')} saving={saving === 'raid.threshold'} />
                        <NumberInput label="Within (seconds)" description="Time window for the burst" value={raid.window ?? 10} icon={<Clock size={14} color="#f0b232" />} color="#f0b232" onSave={(v) => patch('raid.window', Math.max(2, v), 'Raid window')} saving={saving === 'raid.window'} />
                        <NumberInput label="Timeout (minutes)" description="How long offenders are muted" value={raid.timeout_minutes ?? 60} icon={<Hourglass size={14} color="#5865f2" />} color="#5865f2" onSave={(v) => patch('raid.timeout_minutes', Math.max(1, v), 'Raid timeout')} saving={saving === 'raid.timeout_minutes'} />
                      </div>
                    )}
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(242,63,67,0.06)', border: '1px solid rgba(242,63,67,0.15)', borderRadius: 8 }}>
                      <Info size={13} color="#f23f43" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: '#6d6f78' }}>Trusted (allowlisted) domains and whitelisted members never trigger this. Make sure Link Protect has <b>Moderate Members</b> so timeouts work.</p>
                    </div>
                  </Card>
                </div>
              )}

              {/* SCAM SHIELD */}
              {section === 'scamshield' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Scam Shield" description="Stops hijacked accounts and scam bots — the ones that paste the same scam into every channel" icon={ShieldAlert} />

                  <div className="stats-3col-dashboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <StatCard label="Flagged accounts (network)" value={shieldStats?.flaggedTotal ?? '—'} icon={Globe} color="#f23f43" />
                    <StatCard label="Newly flagged (7 days)" value={shieldStats?.flaggedWeek ?? '—'} icon={TrendingUp} color="#f0b232" />
                    <StatCard label="Caught in this server" value={shieldStats?.guildCatches ?? '—'} icon={ShieldAlert} color="#23a55a" />
                  </div>

                  <Card title="Scam Spam Detection">
                    <ToggleSwitch
                      checked={!!scamguard.enabled}
                      onChange={(v) => patch('scamguard.enabled', v, 'Scam spam detection')}
                      label="Detect cross-channel scam spam"
                      description="One account posting the same message (link, image or wall of text) into several channels within seconds — every copy is deleted and the action below is applied."
                      disabled={saving === 'scamguard.enabled'}
                    />
                    {scamguard.enabled && (
                      <>
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e1e22' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ban size={14} color="#f23f43" />
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>Action on detection</label>
                          </div>
                          <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>The messages are always deleted — this decides what happens to the account</p>
                          <SegmentPicker
                            value={scamguard.action ?? 'ban'}
                            onChange={(v) => patch('scamguard.action', v, 'Scam Shield action')}
                            disabled={saving === 'scamguard.action'}
                            options={[
                              { id: 'delete',  label: 'Delete only', color: '#949ba4' },
                              { id: 'timeout', label: 'Timeout',     color: '#5865f2' },
                              { id: 'kick',    label: 'Kick',        color: '#e0683c' },
                              { id: 'ban',     label: 'Ban',         color: '#f23f43' },
                            ]}
                          />
                        </div>
                        <div className="thresholds-3col" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e1e22', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                          <NumberInput label="Channels" description="Same message in this many different channels" value={scamguard.channels ?? 3} icon={<Target size={14} color="#f23f43" />} color="#f23f43" onSave={(v) => patch('scamguard.channels', Math.max(2, v), 'Scam Shield channels')} saving={saving === 'scamguard.channels'} />
                          <NumberInput label="Within (seconds)" description="Time window for the spam burst" value={scamguard.window ?? 10} icon={<Clock size={14} color="#f0b232" />} color="#f0b232" onSave={(v) => patch('scamguard.window', Math.min(300, Math.max(5, v)), 'Scam Shield window')} saving={saving === 'scamguard.window'} />
                          {scamguard.action === 'timeout' && (
                            <NumberInput label="Timeout (minutes)" description="How long the account is muted" value={scamguard.timeout_minutes ?? 60} icon={<Hourglass size={14} color="#5865f2" />} color="#5865f2" onSave={(v) => patch('scamguard.timeout_minutes', Math.max(1, v), 'Scam Shield timeout')} saving={saving === 'scamguard.timeout_minutes'} />
                          )}
                        </div>
                      </>
                    )}
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(242,63,67,0.06)', border: '1px solid rgba(242,63,67,0.15)', borderRadius: 8 }}>
                      <Info size={13} color="#f23f43" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: '#6d6f78' }}>Whitelisted members and roles never trigger this. Every catch is recorded in the <b>Activity Log</b> with the reason, and the account is flagged in the Link Protect network. For kicks/bans make sure the Link Protect role sits <b>above</b> member roles.</p>
                    </div>
                  </Card>

                  <Card title="Known Scammer Check">
                    <ToggleSwitch
                      checked={!!scamguard.join_check}
                      onChange={(v) => patch('scamguard.join_check', v, 'Known scammer check')}
                      label="Remove known scam accounts automatically"
                      description="Accounts that Link Protect already caught scam-spamming on other servers are removed the moment they join (or post their first message here)."
                      disabled={saving === 'scamguard.join_check'}
                    />
                    {scamguard.join_check && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e1e22', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <LogIn size={14} color="#f0b232" />
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>Action on join</label>
                          </div>
                          <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>What happens to a known scam account</p>
                          <SegmentPicker
                            value={scamguard.join_action ?? 'kick'}
                            onChange={(v) => patch('scamguard.join_action', v, 'Join action')}
                            disabled={saving === 'scamguard.join_action'}
                            options={[
                              { id: 'kick', label: 'Kick', color: '#e0683c' },
                              { id: 'ban',  label: 'Ban',  color: '#f23f43' },
                            ]}
                          />
                        </div>
                        <div style={{ minWidth: 220 }}>
                          <NumberInput label="Caught on at least" description="Servers the account must have been caught on — higher = safer against false positives" value={scamguard.min_servers ?? 2} icon={<Globe size={14} color="#5865f2" />} color="#5865f2" onSave={(v) => patch('scamguard.min_servers', Math.max(1, v), 'Minimum servers')} saving={saving === 'scamguard.min_servers'} />
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 8 }}>
                      <Info size={13} color="#5865f2" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: '#6d6f78' }}>Flags only come from Link Protect <b>catching the behaviour live</b> — never from reports or keyword matches. Only the account ID is stored, no messages. Server owners, admins and whitelisted members are never auto-removed, and every removal lands in the Activity Log with the full reason.</p>
                    </div>
                  </Card>

                  <Card title="Scan Existing Members">
                    <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.6, marginBottom: 12 }}>
                      The join check only catches scammers <b>as they join</b>. Run a one-time scan to
                      check everyone <b>already in your server</b> against the flag database — accounts
                      that sneaked in earlier get removed too, using your join-check settings above
                      (<b>{scamguard.join_action === 'ban' ? 'ban' : 'kick'}</b>, flagged on ≥ {scamguard.min_servers ?? 2} servers).
                    </p>
                    <button onClick={runMemberScan} disabled={scanning}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, background: scanning ? '#2e2e36' : '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: scanning ? 'default' : 'pointer' }}>
                      {scanning
                        ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Scanning members…</>
                        : <><Radar size={14} /> Scan existing members</>}
                    </button>
                    {scanning && (
                      <p style={{ fontSize: 12, color: '#52535a', marginTop: 10 }}>This can take up to a minute on large servers — you can leave this page, it keeps running.</p>
                    )}
                    {scanResult && !scanning && (
                      <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: scanResult.removed > 0 ? 'rgba(242,63,67,0.08)' : 'rgba(35,165,90,0.07)', border: `1px solid ${scanResult.removed > 0 ? 'rgba(242,63,67,0.25)' : 'rgba(35,165,90,0.2)'}` }}>
                        {scanResult.capped ? (
                          <p style={{ fontSize: 13, color: '#f0b232' }}><b>{scanResult.eligible} flagged members</b> exceeded the safety cap ({scanResult.cap}) — <b>nothing was removed</b>. That many matches is unusual; please review the Flagged Accounts list before acting.</p>
                        ) : (
                          <p style={{ fontSize: 13, color: '#c9ccd4' }}>
                            Scanned <b style={{ color: '#f2f3f5' }}>{scanResult.membersScanned.toLocaleString()}</b> members ·{' '}
                            {scanResult.removed > 0
                              ? <><b style={{ color: '#f23f43' }}>{scanResult.removed} {scanResult.action === 'ban' ? 'banned' : 'kicked'}</b>{scanResult.failed > 0 ? ` · ${scanResult.failed} couldn't be removed (permissions/role)` : ''}</>
                              : <b style={{ color: '#23a55a' }}>no flagged accounts found ✓</b>}
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* WARNINGS */}
              {section === 'warnings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Warning System" description="Configure automatic actions when users accumulate warnings" icon={Ban} />
                  <Card title="Action Thresholds" tourId="thresholds">
                    <div className="thresholds-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                      <NumberInput label="Kick threshold" description="User is kicked at this many warnings (0 = disabled)" value={warn.kick ?? 0} icon={<TrendingUp size={14} color="#e0683c" />} color="#e0683c" onSave={(v) => patch('warn.kick', v, 'Kick threshold')} saving={saving === 'warn.kick'} />
                      <NumberInput label="Ban threshold" description="User is banned at this many warnings (0 = disabled)" value={warn.ban ?? 0} icon={<Ban size={14} color="#f23f43" />} color="#f23f43" onSave={(v) => patch('warn.ban', v, 'Ban threshold')} saving={saving === 'warn.ban'} />
                      <NumberInput label="Timeout threshold" description="User is timed out at this many warnings (0 = disabled)" value={warn.timeout?.warnings ?? 0} icon={<Clock size={14} color="#5865f2" />} color="#5865f2" onSave={(v) => patch('warn.timeout.warnings', v, 'Timeout threshold')} saving={saving === 'warn.timeout.warnings'} />
                    </div>
                  </Card>
                  <Card title="Timeout Duration">
                    <div style={{ maxWidth: 200 }}>
                      <NumberInput label="Duration (minutes)" description="How long the timeout lasts when triggered" value={warn.timeout?.time ?? 0} icon={<Clock size={14} color="#5865f2" />} color="#5865f2" onSave={(v) => patch('warn.timeout.time', v, 'Timeout duration')} saving={saving === 'warn.timeout.time'} />
                    </div>
                  </Card>
                  <Card title="Warning Decay" tourId="decay">
                    <ToggleSwitch
                      checked={!!decay.enabled}
                      onChange={(v) => patch('decay.enabled', v, 'Warning decay')}
                      label="Auto-expire old warnings"
                      description="Warnings are forgiven after a while, so a single old mistake doesn't count forever"
                      disabled={saving === 'decay.enabled'}
                    />
                    {decay.enabled && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e1e22', maxWidth: 220 }}>
                        <NumberInput
                          label="Expire after (days)"
                          description="A warning is removed once it's older than this many days"
                          value={decay.days ?? 30}
                          icon={<Hourglass size={14} color="#23a55a" />}
                          color="#23a55a"
                          onSave={(v) => patch('decay.days', Math.max(1, v), 'Decay window')}
                          saving={saving === 'decay.days'}
                        />
                      </div>
                    )}
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(35,165,90,0.06)', border: '1px solid rgba(35,165,90,0.15)', borderRadius: 8 }}>
                      <Info size={13} color="#23a55a" style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: '#6d6f78' }}>
                        {decay.enabled
                          ? `Each warning is timestamped. Once it's older than ${decay.days ?? 30} day(s) it's automatically removed and stops counting toward kick/ban. Expired warnings are cleaned up hourly.`
                          : 'When off, warnings are kept until you reset them manually. Turn this on so well-behaved members are gradually forgiven.'}
                      </p>
                    </div>
                  </Card>
                  {(() => {
                    const entries = Object.entries(warn).filter(([k]) => !['kick', 'ban', 'timeout'].includes(k));
                    if (entries.length === 0) return (
                      <Card title="Warned Users">
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                          <CheckCircle2 size={28} color="#23a55a" style={{ margin: '0 auto 8px' }} />
                          <p style={{ fontSize: 13, color: '#52535a' }}>No warned users — server is clean!</p>
                        </div>
                      </Card>
                    );
                    return (
                      <Card title={`Warned Users (${entries.length})`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {entries.map(([userId, ud]) => {
                            const u = ud as { Warn?: number; reason?: string[] };
                            const w = u.Warn ?? 0;
                            const reasons = Array.isArray(u.reason) ? u.reason : [];
                            const color = w >= (warn.ban ?? 999) ? '#f23f43' : w >= (warn.kick ?? 999) ? '#f0b232' : '#5865f2';
                            return (
                              <div key={userId} onClick={() => setSelectedUser({ id: userId, warns: w, reasons })}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#52535a'; (e.currentTarget as HTMLElement).style.background = '#232329'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; (e.currentTarget as HTMLElement).style.background = '#18181b'; }}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6d6f78', flexShrink: 0 }}>{(userNames[userId] ?? userId).slice(0, 2).toUpperCase()}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userNames[userId] ?? userId}</p>
                                  <p style={{ fontSize: 11, color: '#52535a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {reasons.length > 0 ? reasons[reasons.length - 1] : userId}
                                  </p>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}18`, padding: '3px 8px', borderRadius: 99, flexShrink: 0 }}>{w} warns</span>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    );
                  })()}
                  <Card title="Moderate a Member">
                    <p style={{ fontSize: 12, color: '#6d6f78', marginBottom: 14 }}>
                      Search any member and warn, time out, kick or ban them — without opening Discord.
                    </p>
                    <MemberModeration guildId={guildId} onToast={addToast} onChanged={() => { fetchData(); fetchStats(); }} />
                  </Card>
                </div>
              )}

              {/* CHANNEL RULES */}
              {section === 'channelrules' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Channel Rules" description="Make individual channels behave differently from the rest of the server" icon={Target} />
                  <div data-tour="channelrules">
                    <ChannelRules
                      guildId={guildId}
                      overrides={overrides}
                      onSaved={refreshDataSilently}
                      addToast={addToast}
                    />
                  </div>
                </div>
              )}

              {/* ACCESS */}
              {section === 'access' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Access Control" description="Whitelist channels, members, or roles — and grant dashboard access" icon={Lock} />
                  <div data-tour="access">
                    <TeamAccess guildId={guildId} addToast={addToast} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 8 }}>
                    <Info size={13} color="#5865f2" style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: '#6d6f78' }}>Whitelisted items bypass all link restrictions. Add Discord IDs (18-digit numbers).</p>
                  </div>
                  <PickerList title="Whitelisted Channels" description="Links are allowed in these channels" icon={<Lock size={13} color="#5865f2" />} pickerType="channel" guildId={guildId} value={channel.channel} onSave={(v) => patch('channel.channel', v, 'Whitelisted channels')} saving={saving === 'channel.channel'} />
                  <PickerList title="Whitelisted Categories" description="Links are allowed in all channels under these categories" icon={<Lock size={13} color="#5865f2" />} pickerType="category" guildId={guildId} value={channel.category ?? []} onSave={(v) => patch('channel.category', v, 'Whitelisted categories')} saving={saving === 'channel.category'} />
                  <PickerList title="Whitelisted Members" description="These users can post any links" icon={<Users size={13} color="#23a55a" />} pickerType="member" guildId={guildId} value={channel.member} onSave={(v) => patch('channel.member', v, 'Whitelisted members')} saving={saving === 'channel.member'} />
                  <PickerList title="Whitelisted Roles" description="Members with these roles can post any links" icon={<Shield size={13} color="#f0b232" />} pickerType="role" guildId={guildId} value={channel.role} onSave={(v) => patch('channel.role', v, 'Whitelisted roles')} saving={saving === 'channel.role'} />

                  <Card title={`Allowlisted Domains (${allow.length})`} tourId="allowlist">
                    <p style={{ fontSize: 12, color: '#52535a', marginBottom: 14 }}>
                      Trusted domains that bypass blocking — including malware/phishing detection. Add a
                      domain (e.g. <span style={{ fontFamily: 'monospace', color: '#949ba4' }}>example.com</span>); its subdomains are covered too.
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <input type="text" value={newAllow} onChange={(e) => setNewAllow(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && newAllow.trim()) { patch('link.allow', [...allow, newAllow.trim().toLowerCase()], 'Allowlist'); setNewAllow(''); } }}
                        placeholder="Enter trusted domain (e.g. youtube.com)"
                        style={{ flex: 1, padding: '9px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, color: '#f2f3f5', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = '#23a55a')}
                        onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}
                      />
                      <button onClick={() => { if (newAllow.trim()) { patch('link.allow', [...allow, newAllow.trim().toLowerCase()], 'Allowlist'); setNewAllow(''); } }}
                        disabled={!newAllow.trim() || saving === 'link.allow'}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#23a55a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!newAllow.trim() || saving === 'link.allow') ? 0.4 : 1 }}>
                        <Plus size={14} /> Add
                      </button>
                    </div>
                    {allow.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <CheckCircle2 size={22} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 13, color: '#52535a' }}>No trusted domains yet</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {allow.map((dom, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7 }}>
                            <span style={{ fontSize: 13, color: '#23a55a', fontFamily: 'monospace' }}>{dom}</span>
                            <button onClick={() => patch('link.allow', allow.filter((_, j) => j !== i), 'Allowlist')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4, transition: 'color 0.15s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#f23f43')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* MESSAGES */}
              {section === 'messages' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Messages" description="Customize how Link Protect talks to your members" icon={MessageSquare} />
                  <MessagesTab guildId={guildId} data={data} patch={patch} saving={saving} onToast={addToast} />
                </div>
              )}

              {/* BLACKLIST */}
              {section === 'blacklist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Custom Blacklist" description="Add specific domains or URLs to always block" icon={List} />
                  <Card title={`Blacklisted Links (${links.length})`} tourId="blacklist">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <input type="text" value={newLink} onChange={(e) => setNewLink(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && newLink.trim()) { patch('link.links', [...links, newLink.trim()], 'Blacklist'); setNewLink(''); } }}
                        placeholder="Enter domain (e.g. example.com)"
                        style={{ flex: 1, padding: '9px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, color: '#f2f3f5', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
                        onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}
                      />
                      <button onClick={() => { if (newLink.trim()) { patch('link.links', [...links, newLink.trim()], 'Blacklist'); setNewLink(''); } }}
                        disabled={!newLink.trim() || saving === 'link.links'}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!newLink.trim() || saving === 'link.links') ? 0.4 : 1 }}>
                        <Plus size={14} /> Add
                      </button>
                    </div>
                    {links.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <List size={24} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 13, color: '#52535a' }}>No links blacklisted yet</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {links.map((link, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7 }}>
                            <span style={{ fontSize: 13, color: '#949ba4', fontFamily: 'monospace' }}>{link}</span>
                            <button onClick={() => patch('link.links', links.filter((_, j) => j !== i), 'Blacklist')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4, transition: 'color 0.15s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#f23f43')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* STATS */}
              {section === 'stats' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <SectionHeader title="Server Statistics" description="Warning history and user moderation data" icon={BarChart3} />
                    <button onClick={fetchStats} style={{ padding: '7px 10px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#52535a')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}>
                      <RefreshCw size={13} color="#6d6f78" />
                    </button>
                  </div>
                  {!stats ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <div style={{ width: 28, height: 28, border: '2px solid #5865f2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                    </div>
                  ) : (
                    <>
                      <div data-tour="stats" className="stats-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        <StatCard label="Total warnings" value={stats.totalWarnings} icon={AlertTriangle} color="#f0b232" />
                        <StatCard label="Users warned" value={stats.warnedUsers} icon={Users} color="#5865f2" />
                        <StatCard label="Kick threshold" value={stats.kickThreshold} icon={TrendingUp} color="#f0b232" />
                        <StatCard label="Ban threshold" value={stats.banThreshold} icon={Ban} color="#f23f43" />
                      </div>
                      <TrendsChart guildId={guildId} />
                      <Card title="Top Warned Users">
                        {stats.topWarned.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <CheckCircle2 size={28} color="#23a55a" style={{ margin: '0 auto 8px' }} />
                            <p style={{ fontSize: 13, color: '#52535a' }}>No warned users yet</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {stats.topWarned.map((user, i) => (
                              <div key={user.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? 'rgba(240,178,50,0.15)' : i === 1 ? 'rgba(181,186,193,0.1)' : 'rgba(46,46,54,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: i === 0 ? '#f0b232' : i === 1 ? '#949ba4' : '#52535a', flexShrink: 0 }}>
                                  {i + 1}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userNames[user.userId] ?? user.userId}</p>
                                  {user.reasons.length > 0 && <p style={{ fontSize: 11, color: '#52535a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.reasons[user.reasons.length - 1]}</p>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                  <div style={{ width: 72, height: 4, background: '#2e2e36', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, (user.warnings / (stats.topWarned[0]?.warnings || 1)) * 100)}%`, background: '#5865f2', borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f2f3f5', minWidth: 28, textAlign: 'right' }}>{user.warnings}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </>
                  )}
                </div>
              )}

              {/* LOG */}
              {section === 'log' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <SectionHeader title="Activity Log" description="Live moderation feed — auto-refreshes every 5 seconds" icon={Activity} />
                    <button onClick={fetchActions} style={{ padding: '7px 10px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#52535a')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}>
                      <RefreshCw size={13} color="#6d6f78" />
                    </button>
                  </div>
                  <WarnLogConfig
                    guildId={guildId}
                    channelId={data.log?.['log-channel'] ?? 0}
                    activated={!!data.log?.Activated}
                    onPatch={patch}
                    saving={saving}
                    show={data.log?.show}
                    digest={!!data.log?.digest}
                  />
                  <Card title={`Recent Actions (${actions.length})`} tourId="log">
                    <ActivityTimeline guildId={guildId} actions={actions} onNavigate={(sec) => selectSection(sec as Section)} />
                  </Card>
                </div>
              )}

              {/* AUDIT LOG */}
              {section === 'audit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <SectionHeader title="Audit Log" description="Who changed which setting, and when — via dashboard, app or commands" icon={History} />
                    <button onClick={fetchAudit} style={{ padding: '7px 10px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer' }}>
                      <RefreshCw size={13} color="#6d6f78" />
                    </button>
                  </div>
                  <Card title={`Recent Changes (${audit.length})`} tourId="audit">
                    {audit.length === 0 ? (
                      <EmptyState icon={History} title="No changes recorded yet"
                        sub="Every settings change — from the dashboard, the app or a bot command — lands here with who changed it and when." />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {audit.map((e, i) => {
                          const who = e.username ?? `User …${e.userId.slice(-4)}`;
                          const s = Math.floor(Date.now() / 1000 - e.timestamp);
                          const rel = s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
                          return (
                            <div key={i} className="log-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 10px', borderRadius: 7, background: i % 2 === 0 ? '#111113' : 'transparent' }}>
                              <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#6d6f78', flexShrink: 0, marginTop: 1 }}>{who.slice(0, 2).toUpperCase()}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, color: '#f2f3f5', fontWeight: 500 }}>{e.description}</p>
                                <p style={{ fontSize: 11, color: '#52535a', marginTop: 2 }}>{who} · {rel}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>
              )}

            </motion.div>
        </main>
      </div>

      {/* Warning detail modal */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedUser(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#111113', border: '1px solid #2e2e36', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
              {/* Modal header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6d6f78' }}>{(userNames[selectedUser.id] ?? selectedUser.id).slice(0, 2).toUpperCase()}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', fontFamily: userNames[selectedUser.id] ? 'inherit' : 'monospace' }}>{userNames[selectedUser.id] ?? selectedUser.id}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#52535a', marginLeft: 36 }}>{selectedUser.warns} warning{selectedUser.warns !== 1 ? 's' : ''} total</span>
                </div>
                <button onClick={() => setSelectedUser(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4, display: 'flex' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#f2f3f5')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
                  <X size={18} />
                </button>
              </div>

              {/* Warning list */}
              <div style={{ overflowY: 'auto', padding: '12px 20px', flex: 1 }}>
                {selectedUser.reasons.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#52535a', textAlign: 'center', padding: '20px 0' }}>No reasons recorded</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedUser.reasons.map((reason, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(88,101,242,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#5865f2', flexShrink: 0 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.5 }}>{reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick moderation actions */}
              <div style={{ padding: '4px 20px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {([
                  { kind: 'warn', label: 'Warn', color: '#5865f2', Icon: AlertTriangle, destructive: false },
                  { kind: 'timeout', label: 'Timeout', color: '#5865f2', Icon: Clock, destructive: false },
                  { kind: 'kick', label: 'Kick', color: '#f0b232', Icon: UserX, destructive: true },
                  { kind: 'ban', label: 'Ban', color: '#f23f43', Icon: Ban, destructive: true },
                ] as const).map(({ kind, label, color, Icon, destructive }) => {
                  const confirming = modalConfirm === kind;
                  const busy = modalBusy === kind;
                  return (
                    <button key={kind} disabled={modalBusy !== null}
                      onClick={async () => {
                        if (destructive && !confirming) {
                          setModalConfirm(kind);
                          setTimeout(() => setModalConfirm((c) => (c === kind ? null : c)), 3500);
                          return;
                        }
                        setModalConfirm(null); setModalBusy(kind);
                        const uname = userNames[selectedUser.id] ?? selectedUser.id;
                        const ok = await moderate(kind, selectedUser.id, uname);
                        setModalBusy(null);
                        if (ok && (kind === 'kick' || kind === 'ban')) setSelectedUser(null);
                      }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 4px', fontSize: 11, fontWeight: 600, borderRadius: 8, cursor: modalBusy ? 'default' : 'pointer', color: confirming ? '#fff' : color, background: confirming ? color : `${color}14`, border: `1px solid ${confirming ? color : `${color}40`}`, opacity: modalBusy && !busy ? 0.4 : 1 }}>
                      <Icon size={14} />
                      {busy ? '…' : confirming ? 'Confirm?' : label}
                    </button>
                  );
                })}
              </div>

              {/* Modal footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #1e1e22', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setSelectedUser(null)}
                  style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
                  Close
                </button>
                <button onClick={async () => {
                    try {
                      const res = await fetch(`/api/guild/${guildId}/warns/${selectedUser.id}`, { method: 'DELETE' });
                      if (res.ok) { addToast('success', 'Warnings reset'); } else { addToast('error', 'Reset failed'); }
                    } catch { addToast('error', 'Reset failed'); }
                    setSelectedUser(null);
                    fetchData();
                  }}
                  disabled={saving !== null}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#f23f43', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: saving !== null ? 0.5 : 1 }}>
                  <Trash2 size={13} /> Reset warnings
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      <DashboardTour run={tourRun} onClose={closeTour} onSectionChange={(s) => setSection(s as Section)} />
      <VotePromo active={flagsReady && !!data && !tourRun && !votePromoBlocked.current && !votePromptSeenRemote.current} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
