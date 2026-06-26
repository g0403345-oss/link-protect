'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, AlertTriangle, Lock, List, BarChart3,
  ChevronLeft, Save, CheckCircle2, XCircle, RefreshCw,
  EyeOff, Users, TrendingUp, Ban, Clock, Trash2, Plus, X, Info, Activity,
  Hourglass, Target,
} from 'lucide-react';
import Link from 'next/link';
import ToggleSwitch from '@/components/ToggleSwitch';
import PickerList from '@/components/PickerList';
import ChannelRules from '@/components/ChannelRules';
import type { ServerData, GuildStats } from '@/lib/db';
import Navbar from '@/components/Navbar';

type Section = 'overview' | 'blockers' | 'warnings' | 'channelrules' | 'access' | 'blacklist' | 'stats' | 'log';

interface GuildAction {
  user_id: string; username: string; channel_id: string;
  action: 'warned' | 'kicked' | 'banned' | 'timeout';
  reason: string; warn_count: number; timestamp: number;
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>{title}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: typeof Shield; color: string }) {
  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span style={{ fontSize: 12, color: '#52535a', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: '-0.02em' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
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


/* ── main ──────────────────────────────────────────────────── */

export default function GuildDashboard() {
  const params = useParams<{ guildId: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const guildId = params.guildId;

  const [section, setSection] = useState<Section>('overview');
  const [selectedUser, setSelectedUser] = useState<{ id: string; warns: number; reasons: string[] } | null>(null);
  const [data, setData] = useState<ServerData | null>(null);
  const [stats, setStats] = useState<GuildStats | null>(null);
  const [guildInfo, setGuildInfo] = useState<{ name: string; icon: string | null } | null>(null);
  const [actions, setActions] = useState<GuildAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newLink, setNewLink] = useState('');
  const { toasts, addToast } = useToast();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/dashboard');
  }, [status, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guild/${guildId}`);
      if (!res.ok) { if (res.status === 403) { router.push('/dashboard'); return; } throw new Error(); }
      setData(await res.json() as ServerData);
    } catch { addToast('error', 'Failed to load settings'); }
    finally { setLoading(false); }
  }, [guildId, router, addToast]);

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

  useEffect(() => {
    fetch(`/api/guild/${guildId}/discord-info`)
      .then(r => r.json()).then(d => setGuildInfo(d)).catch(() => {});
  }, [guildId]);

  useEffect(() => { if (status === 'authenticated') { fetchData(); fetchStats(); fetchActions(); } }, [status, fetchData, fetchStats, fetchActions]);

  // Auto-refresh actions every 5 s when the log tab is active
  useEffect(() => {
    if (section !== 'log') return;
    const id = setInterval(fetchActions, 5000);
    return () => clearInterval(id);
  }, [section, fetchActions]);

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
        for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] as Record<string, unknown>;
        cur[keys[keys.length - 1]] = value;
        return u;
      });
      addToast('success', label ? `${label} saved` : 'Saved');
    } catch { addToast('error', 'Failed to save'); }
    finally { setSaving(null); }
  }, [guildId, addToast]);

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
  const warn = data.warn ?? {};
  const channel = data.channel ?? { channel: [], category: [], member: [], role: [] };
  const links = data.link?.links ?? [];
  const decay = data.decay ?? { enabled: false, days: 30 };
  const overrides = data.overrides ?? {};

  const NAV: { id: Section; label: string; icon: typeof Shield; desc: string }[] = [
    { id: 'overview',     label: 'Overview',      icon: Shield,        desc: 'Status & summary' },
    { id: 'blockers',     label: 'Link Blockers',  icon: AlertTriangle, desc: 'What gets blocked' },
    { id: 'warnings',     label: 'Warnings',       icon: Ban,           desc: 'Kick, ban & decay' },
    { id: 'channelrules', label: 'Channel Rules',  icon: Target,        desc: 'Per-channel behaviour' },
    { id: 'access',       label: 'Access Control', icon: Lock,          desc: 'Whitelist channels & roles' },
    { id: 'blacklist',    label: 'Blacklist',       icon: List,          desc: 'Custom blocked domains' },
    { id: 'stats',        label: 'Statistics',     icon: BarChart3,     desc: 'Warning history' },
    { id: 'log',          label: 'Activity Log',   icon: Activity,      desc: 'Live moderation feed' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', paddingTop: 60 }}>
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
        <span style={{ fontSize: 11, color: '#2e2e36', fontFamily: 'monospace', marginLeft: 'auto' }}>{guildId}</span>
      </div>

      {/* Mobile section tab strip — hidden on desktop, sticky below breadcrumb */}
      <div className="mobile-only" style={{ overflowX: 'auto', gap: 6, padding: '10px 16px', background: '#111113', borderBottom: '1px solid #1e1e22', scrollbarWidth: 'none', position: 'sticky', top: 104, zIndex: 30 }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button key={id} onClick={() => setSection(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, background: active ? 'rgba(88,101,242,0.15)' : 'transparent', color: active ? '#5865f2' : '#6d6f78', flexShrink: 0, transition: 'all 0.15s' }}>
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <aside className="guild-sidebar" style={{ width: 220, background: '#111113', borderRight: '1px solid #1e1e22', flexShrink: 0, position: 'sticky', top: 104, height: 'calc(100vh - 104px)', overflowY: 'auto', padding: '12px 8px' }}>
          {NAV.map(({ id, label, icon: Icon, desc }) => {
            const active = section === id;
            return (
              <button key={id} onClick={() => setSection(id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: 2, transition: 'background 0.1s', background: active ? 'rgba(88,101,242,0.12)' : 'transparent', borderLeft: active ? '2px solid #5865f2' : '2px solid transparent' }}>
                <Icon size={15} color={active ? '#5865f2' : '#52535a'} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#f2f3f5' : '#949ba4' }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#52535a', marginTop: 1 }}>{desc}</div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <main className="guild-main" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

              {/* OVERVIEW */}
              {section === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Overview" description="Quick summary of your server's protection status" icon={Shield} />
                  <div className="stats-3col-dashboard" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <StatCard label="Warnings issued" value={stats?.totalWarnings ?? '—'} icon={AlertTriangle} color="#f0b232" />
                    <StatCard label="Users warned" value={stats?.warnedUsers ?? '—'} icon={Users} color="#5865f2" />
                    <StatCard label="Active blockers" value={Object.values(protect).filter(Boolean).length} icon={Shield} color="#23a55a" />
                  </div>
                  <Card title="Active Protections">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(protect).map(([k, v]) => v ? (
                        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 500, color: '#23a55a', background: 'rgba(35,165,90,0.1)', border: '1px solid rgba(35,165,90,0.2)', borderRadius: 99 }}>
                          <CheckCircle2 size={11} /> {k}
                        </span>
                      ) : null)}
                      {data.silent && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 500, color: '#949ba4', background: 'rgba(148,155,164,0.08)', border: '1px solid rgba(148,155,164,0.15)', borderRadius: 99 }}>
                          <EyeOff size={11} /> silent
                        </span>
                      )}
                      {Object.values(protect).every((v) => !v) && !data.silent && (
                        <p style={{ fontSize: 13, color: '#52535a' }}>No blockers active</p>
                      )}
                    </div>
                  </Card>
                  <Card title="Warning Thresholds">
                    <div className="thresholds-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'center' }}>
                      {[
                        { label: 'Kick at', value: warn.kick ?? 0, color: '#f0b232' },
                        { label: 'Ban at', value: warn.ban ?? 0, color: '#f23f43' },
                        { label: 'Timeout at', value: warn.timeout?.warnings ?? 0, color: '#5865f2' },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div style={{ fontSize: 32, fontWeight: 900, color, letterSpacing: '-0.03em' }}>{value}</div>
                          <div style={{ fontSize: 12, color: '#52535a', marginTop: 4 }}>{label} warnings</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* BLOCKERS */}
              {section === 'blockers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Link Blockers" description="Toggle which types of links are blocked in your server" icon={AlertTriangle} />
                  <Card title="Platform Blockers">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {[
                        { key: 'all',     label: 'Block All Links',      description: 'Block every external link (overrides all others)' },
                        { key: 'nsfw',    label: 'NSFW Content',         description: 'Block known adult/NSFW websites' },
                        { key: 'nitro',   label: 'Nitro Scams',          description: 'Block fake Discord Nitro scam links' },
                        { key: 'malware', label: 'Malware / Phishing',   description: 'Block known malware and phishing URLs' },
                        { key: 'invite',  label: 'Discord Invites',      description: 'Block discord.gg invite links' },
                        { key: 'youtube', label: 'YouTube',              description: 'Block youtube.com and youtu.be links' },
                        { key: 'google',  label: 'Google',               description: 'Block google.com links' },
                        { key: 'gif',     label: 'GIFs',                 description: 'Block GIF links (tenor, giphy, etc.)' },
                        { key: 'twitch',  label: 'Twitch',               description: 'Block twitch.tv links' },
                        { key: 'steam',   label: 'Steam',                description: 'Block Steam community and store links' },
                        { key: 'bit',     label: 'bit.ly & shorteners',  description: 'Block URL shortener links' },
                      ].map(({ key, label, description }) => (
                        <div key={key} style={{ borderBottom: '1px solid #1e1e22', margin: '0 -18px', padding: '0 18px' }}>
                          <ToggleSwitch
                            checked={!!protect[key as keyof typeof protect]}
                            onChange={(v) => patch(`protect.${key}`, v, label)}
                            label={label}
                            description={description}
                            disabled={saving === `protect.${key}`}
                          />
                        </div>
                      ))}
                    </div>
                  </Card>
                  <Card title="Silent Mode">
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
                </div>
              )}

              {/* WARNINGS */}
              {section === 'warnings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Warning System" description="Configure automatic actions when users accumulate warnings" icon={Ban} />
                  <Card title="Action Thresholds">
                    <div className="thresholds-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                      <NumberInput label="Kick threshold" description="User is kicked at this many warnings (0 = disabled)" value={warn.kick ?? 0} icon={<TrendingUp size={14} color="#f0b232" />} color="#f0b232" onSave={(v) => patch('warn.kick', v, 'Kick threshold')} saving={saving === 'warn.kick'} />
                      <NumberInput label="Ban threshold" description="User is banned at this many warnings (0 = disabled)" value={warn.ban ?? 0} icon={<Ban size={14} color="#f23f43" />} color="#f23f43" onSave={(v) => patch('warn.ban', v, 'Ban threshold')} saving={saving === 'warn.ban'} />
                      <NumberInput label="Timeout threshold" description="User is timed out at this many warnings (0 = disabled)" value={warn.timeout?.warnings ?? 0} icon={<Clock size={14} color="#5865f2" />} color="#5865f2" onSave={(v) => patch('warn.timeout.warnings', v, 'Timeout threshold')} saving={saving === 'warn.timeout.warnings'} />
                    </div>
                  </Card>
                  <Card title="Timeout Duration">
                    <div style={{ maxWidth: 200 }}>
                      <NumberInput label="Duration (minutes)" description="How long the timeout lasts when triggered" value={warn.timeout?.time ?? 0} icon={<Clock size={14} color="#5865f2" />} color="#5865f2" onSave={(v) => patch('warn.timeout.time', v, 'Timeout duration')} saving={saving === 'warn.timeout.time'} />
                    </div>
                  </Card>
                  <Card title="Warning Decay">
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
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6d6f78', flexShrink: 0 }}>{userId.slice(-2)}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, color: '#949ba4', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userId}</p>
                                  {reasons.length > 0 && (
                                    <p style={{ fontSize: 11, color: '#52535a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reasons[reasons.length - 1]}</p>
                                  )}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}18`, padding: '3px 8px', borderRadius: 99, flexShrink: 0 }}>{w} warns</span>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    );
                  })()}
                </div>
              )}

              {/* CHANNEL RULES */}
              {section === 'channelrules' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Channel Rules" description="Make individual channels behave differently from the rest of the server" icon={Target} />
                  <ChannelRules
                    guildId={guildId}
                    overrides={overrides}
                    onSaved={fetchData}
                    addToast={addToast}
                  />
                </div>
              )}

              {/* ACCESS */}
              {section === 'access' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Access Control" description="Whitelist channels, members, or roles from link restrictions" icon={Lock} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 8 }}>
                    <Info size={13} color="#5865f2" style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: '#6d6f78' }}>Whitelisted items bypass all link restrictions. Add Discord IDs (18-digit numbers).</p>
                  </div>
                  <PickerList title="Whitelisted Channels" description="Links are allowed in these channels" icon={<Lock size={13} color="#5865f2" />} pickerType="channel" guildId={guildId} value={channel.channel} onSave={(v) => patch('channel.channel', v, 'Whitelisted channels')} saving={saving === 'channel.channel'} />
                  <PickerList title="Whitelisted Categories" description="Links are allowed in all channels under these categories" icon={<Lock size={13} color="#9b59b6" />} pickerType="category" guildId={guildId} value={channel.category ?? []} onSave={(v) => patch('channel.category', v, 'Whitelisted categories')} saving={saving === 'channel.category'} />
                  <PickerList title="Whitelisted Members" description="These users can post any links" icon={<Users size={13} color="#23a55a" />} pickerType="member" guildId={guildId} value={channel.member} onSave={(v) => patch('channel.member', v, 'Whitelisted members')} saving={saving === 'channel.member'} />
                  <PickerList title="Whitelisted Roles" description="Members with these roles can post any links" icon={<Shield size={13} color="#f0b232" />} pickerType="role" guildId={guildId} value={channel.role} onSave={(v) => patch('channel.role', v, 'Whitelisted roles')} saving={saving === 'channel.role'} />
                </div>
              )}

              {/* BLACKLIST */}
              {section === 'blacklist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SectionHeader title="Custom Blacklist" description="Add specific domains or URLs to always block" icon={List} />
                  <Card title={`Blacklisted Links (${links.length})`}>
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
                      <div className="stats-4col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        <StatCard label="Total warnings" value={stats.totalWarnings} icon={AlertTriangle} color="#f0b232" />
                        <StatCard label="Users warned" value={stats.warnedUsers} icon={Users} color="#5865f2" />
                        <StatCard label="Kick threshold" value={stats.kickThreshold} icon={TrendingUp} color="#f0b232" />
                        <StatCard label="Ban threshold" value={stats.banThreshold} icon={Ban} color="#f23f43" />
                      </div>
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
                                  <p style={{ fontSize: 12, color: '#949ba4', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.userId}</p>
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
              {section === 'log' && (() => {
                const actionMeta: Record<string, { label: string; color: string; bg: string }> = {
                  warned:  { label: 'Warned',   color: '#f0b232', bg: 'rgba(240,178,50,0.08)' },
                  kicked:  { label: 'Kicked',   color: '#f23f43', bg: 'rgba(242,63,67,0.08)' },
                  banned:  { label: 'Banned',   color: '#f23f43', bg: 'rgba(242,63,67,0.12)' },
                  timeout: { label: 'Timeout',  color: '#9b59b6', bg: 'rgba(155,89,182,0.08)' },
                };
                const relTime = (ts: number) => {
                  const s = Math.floor(Date.now() / 1000 - ts);
                  if (s < 60) return `${s}s ago`;
                  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
                  return `${Math.floor(s / 86400)}d ago`;
                };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <SectionHeader title="Activity Log" description="Live moderation feed — auto-refreshes every 5 seconds" icon={Activity} />
                      <button onClick={fetchActions} style={{ padding: '7px 10px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer', transition: 'border-color 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#52535a')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}>
                        <RefreshCw size={13} color="#6d6f78" />
                      </button>
                    </div>
                    <Card title={`Recent Actions (${actions.length})`}>
                      {actions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 0' }}>
                          <Activity size={28} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
                          <p style={{ fontSize: 13, color: '#52535a' }}>No moderation actions yet</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {actions.map((a, i) => {
                            const meta = actionMeta[a.action] ?? actionMeta.warned;
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 7, background: i % 2 === 0 ? '#111113' : 'transparent' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: meta.bg, color: meta.color, flexShrink: 0, marginTop: 1 }}>
                                  {meta.label}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#f2f3f5' }}>{a.username}</span>
                                    <span style={{ fontSize: 11, color: '#52535a' }}>warn #{a.warn_count}</span>
                                    <span style={{ fontSize: 11, color: '#2e2e36' }}>•</span>
                                    <span style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace' }}>#{a.channel_id.slice(-4)}</span>
                                  </div>
                                  <p style={{ fontSize: 12, color: '#6d6f78', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason}</p>
                                </div>
                                <span style={{ fontSize: 11, color: '#52535a', flexShrink: 0, marginTop: 1 }}>{relTime(a.timestamp)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  </div>
                );
              })()}

            </motion.div>
          </AnimatePresence>
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
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6d6f78' }}>{selectedUser.id.slice(-2)}</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', fontFamily: 'monospace' }}>{selectedUser.id}</span>
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
