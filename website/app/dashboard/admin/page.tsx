'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Settings, RefreshCw, Search, Activity, X, ChevronLeft, AlertTriangle, Ban, Clock, Hash } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ADMIN_USER_ID } from '@/lib/admin';

interface GuildInfo { name: string; icon: string | null; }

interface GlobalAction {
  guild_id: number; user_id: string; username: string; channel_id: string;
  action: 'warned' | 'kicked' | 'banned' | 'timeout'; reason: string;
  warn_count: number; timestamp: number;
}

interface UserAction {
  guild_id: number; action: string; reason: string; warn_count: number; timestamp: number;
}

interface UserDetail {
  user_id: string;
  discord: { id: string; username: string; global_name?: string; avatar?: string; discriminator?: string } | null;
  actions: UserAction[];
  guild_warns: Record<string, { count: number; reasons: string[] }>;
}

const PAGE_SIZE = 24;

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  warned:  { label: 'Warned',  color: '#f0b232', bg: 'rgba(240,178,50,0.10)' },
  kicked:  { label: 'Kicked',  color: '#f23f43', bg: 'rgba(242,63,67,0.10)' },
  banned:  { label: 'Banned',  color: '#f23f43', bg: 'rgba(242,63,67,0.14)' },
  timeout: { label: 'Timeout', color: '#5865f2', bg: 'rgba(88,101,242,0.10)' },
};

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function avatarUrl(discord: UserDetail['discord']) {
  if (!discord) return null;
  if (discord.avatar) return `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.webp?size=128`;
  return null;
}

export default function AdminPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [guilds, setGuilds] = useState<string[]>([]);
  const [guildInfos, setGuildInfos] = useState<Record<string, GuildInfo>>({});
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [search, setSearch] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Live feed
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedActions, setFeedActions] = useState<GlobalAction[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  // User detail
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string } | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && session.user?.id !== ADMIN_USER_ID) router.push('/dashboard');
  }, [status, session, router]);

  const fetchGuilds = useCallback(() => {
    setLoading(true); setApiError(false); setDisplayCount(PAGE_SIZE);
    fetch('/api/admin/guilds')
      .then(r => r.json())
      .then(d => {
        if (d.error === 'Bot API unreachable') { setApiError(true); setLoading(false); return; }
        setGuilds(d.guilds ?? []); setLoading(false);
        fetch('/api/admin/guilds/info').then(r => r.json()).then(d => setGuildInfos(d.guilds ?? {})).catch(() => {});
      })
      .catch(() => { setApiError(true); setLoading(false); });
  }, []);

  const fetchFeed = useCallback(() => {
    setFeedLoading(true);
    fetch('/api/admin/actions').then(r => r.json())
      .then(d => { setFeedActions(d.actions ?? []); setFeedLoading(false); })
      .catch(() => setFeedLoading(false));
  }, []);

  const openUser = useCallback((userId: string, username: string) => {
    setSelectedUser({ id: userId, username });
    setUserDetail(null);
    setUserLoading(true);
    fetch(`/api/admin/user/${userId}`).then(r => r.json())
      .then(d => { setUserDetail(d); setUserLoading(false); })
      .catch(() => setUserLoading(false));
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session.user?.id === ADMIN_USER_ID) fetchGuilds();
  }, [status, session, fetchGuilds]);

  useEffect(() => {
    if (!feedOpen) return;
    fetchFeed();
    const iv = setInterval(fetchFeed, 5000);
    return () => clearInterval(iv);
  }, [feedOpen, fetchFeed]);

  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [search]);

  const filtered = guilds.filter(id => {
    const name = guildInfos[id]?.name ?? '';
    return id.includes(search) || name.toLowerCase().includes(search.toLowerCase());
  });
  const visible = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setDisplayCount(c => c + PAGE_SIZE); },
      { rootMargin: '200px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, visible.length]);

  if (status === 'loading' || (status === 'authenticated' && session.user?.id !== ADMIN_USER_ID)) {
    return <div style={{ minHeight: '100vh', background: '#0e0e10' }} />;
  }

  // ── User detail panel content ────────────────────────────────────────────────
  const renderUserDetail = () => {
    if (userLoading || !userDetail) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={20} color="#3e3e4a" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      );
    }

    const disc = userDetail.discord;
    const av = avatarUrl(disc);
    const displayName = disc?.global_name ?? disc?.username ?? selectedUser?.username ?? userDetail.user_id;

    const counts = userDetail.actions.reduce<Record<string, number>>((acc, a) => {
      acc[a.action] = (acc[a.action] ?? 0) + 1; return acc;
    }, {});

    const guildIds = Object.keys(userDetail.guild_warns).length > 0
      ? Object.keys(userDetail.guild_warns)
      : [...new Set(userDetail.actions.map(a => String(a.guild_id)))];

    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Profile */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1e1e22' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            {av ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={av} alt="" style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: `hsl(${parseInt(userDetail.user_id.slice(-3)) % 360}, 55%, 35%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{displayName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
              {disc?.username && disc.global_name && (
                <div style={{ fontSize: 12, color: '#52535a', marginTop: 2 }}>@{disc.username}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <Hash size={10} color="#3e3e4a" />
                <span style={{ fontSize: 10, color: '#3e3e4a', fontFamily: 'monospace' }}>{userDetail.user_id}</span>
              </div>
            </div>
          </div>

          {/* Action summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {(['warned', 'timeout', 'kicked', 'banned'] as const).map(type => {
              const meta = ACTION_META[type];
              const icons = { warned: AlertTriangle, timeout: Clock, kicked: Ban, banned: Ban };
              const Icon = icons[type];
              return (
                <div key={type} style={{ background: '#18181b', border: '1px solid #1e1e22', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <Icon size={13} style={{ color: meta.color, margin: '0 auto 4px', display: 'block' }} />
                  <div style={{ fontSize: 18, fontWeight: 800, color: meta.color }}>{counts[type] ?? 0}</div>
                  <div style={{ fontSize: 10, color: '#52535a', marginTop: 1 }}>{meta.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-guild breakdown */}
        {guildIds.length > 0 && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e1e22' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Servers ({guildIds.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {guildIds.map(gid => {
                const info = guildInfos[gid];
                const warnInfo = userDetail.guild_warns[gid];
                const guildActions = userDetail.actions.filter(a => String(a.guild_id) === gid);
                const lastAction = guildActions[0];
                return (
                  <div key={gid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#18181b', borderRadius: 8, border: '1px solid #1e1e22' }}>
                    {info?.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`https://cdn.discordapp.com/icons/${gid}/${info.icon}.webp?size=32`} alt="" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: `hsl(${parseInt(gid.slice(-3)) % 360}, 55%, 30%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Shield size={11} color="#fff" strokeWidth={2} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {info?.name ?? gid}
                      </div>
                      <div style={{ fontSize: 10, color: '#52535a', marginTop: 1 }}>
                        {guildActions.length} action{guildActions.length !== 1 ? 's' : ''}
                        {lastAction ? ` · last ${relTime(lastAction.timestamp)}` : ''}
                      </div>
                    </div>
                    {warnInfo && warnInfo.count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f0b232', background: 'rgba(240,178,50,0.1)', border: '1px solid rgba(240,178,50,0.2)', padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>
                        {warnInfo.count} warns
                      </span>
                    )}
                    <Link href={`/dashboard/${gid}`} onClick={() => setFeedOpen(false)}
                      style={{ fontSize: 11, fontWeight: 600, color: '#5865f2', textDecoration: 'none', flexShrink: 0, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(88,101,242,0.3)' }}>
                      Open
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full action history */}
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, padding: '0 20px' }}>
            Action History ({userDetail.actions.length})
          </div>
          {userDetail.actions.map((a, i) => {
            const meta = ACTION_META[a.action] ?? ACTION_META.warned;
            const gid = String(a.guild_id);
            return (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 20px', borderBottom: '1px solid #141416', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#18181b')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, padding: '2px 8px', borderRadius: 99, flexShrink: 0, alignSelf: 'flex-start', marginTop: 1 }}>
                  {meta.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#949ba4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason}</div>
                  <div style={{ fontSize: 10, color: '#3e3e4a', marginTop: 3 }}>
                    {guildInfos[gid]?.name ?? gid} · {relTime(a.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
          {userDetail.actions.length === 0 && (
            <p style={{ fontSize: 13, color: '#52535a', textAlign: 'center', padding: '16px 0' }}>No actions recorded</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e10' }}>
      <Navbar />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 60px' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(240,178,50,0.15)', border: '1px solid rgba(240,178,50,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={14} color="#f0b232" />
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em' }}>Admin Panel</h1>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f0b232', background: 'rgba(240,178,50,0.1)', border: '1px solid rgba(240,178,50,0.2)', padding: '2px 8px', borderRadius: 99 }}>ADMIN</span>
              </div>
              <p style={{ fontSize: 13, color: '#52535a' }}>
                {loading ? 'Loading servers…' : `${filtered.length} of ${guilds.length} servers`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setFeedOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', height: 36, borderRadius: 8, background: feedOpen ? 'rgba(88,101,242,0.15)' : '#18181b', border: `1px solid ${feedOpen ? 'rgba(88,101,242,0.4)' : '#2e2e36'}`, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: feedOpen ? '#7289da' : '#949ba4' }}>
                <Activity size={14} />
                Live Feed
                {feedActions.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 99, padding: '1px 6px', marginLeft: 2 }}>
                    {feedActions.length}
                  </span>
                )}
              </button>
              <button onClick={fetchGuilds} disabled={loading}
                style={{ width: 36, height: 36, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <RefreshCw size={14} color="#6d6f78" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: 20 }}>
            <Search size={14} color="#52535a" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input type="text" placeholder="Search by name or ID…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#5865f2')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2e2e36')} />
          </div>

          {apiError && !loading && (
            <div style={{ padding: '20px 24px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#f87171', margin: 0 }}>Bot-API nicht erreichbar</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
                <code style={{ background: '#1e1e22', padding: '1px 5px', borderRadius: 4 }}>sudo systemctl restart linkprotect-api.service</code>
              </p>
            </div>
          )}

          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div key={i} style={{ height: 64, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.05}s` }} />
              ))}
            </div>
          )}

          {!loading && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {visible.map((guildId, i) => (
                  <motion.div key={guildId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min((i % PAGE_SIZE) * 0.015, 0.3) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, transition: 'border-color 0.15s, background 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1e1e22'; (e.currentTarget as HTMLElement).style.background = '#111113'; }}>
                      {guildInfos[guildId]?.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfos[guildId].icon}.webp?size=64`} alt=""
                          style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `hsl(${parseInt(guildId.slice(-3)) % 360}, 55%, 30%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Shield size={14} color="#fff" strokeWidth={2} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {guildInfos[guildId]?.name ?? <span style={{ color: '#52535a' }}>…</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace', marginTop: 1 }}>{guildId}</div>
                      </div>
                      <Link href={`/dashboard/${guildId}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, fontWeight: 600, background: '#5865f2', color: '#fff', borderRadius: 7, textDecoration: 'none', flexShrink: 0 }}>
                        <Settings size={11} /> Manage
                      </Link>
                    </div>
                  </motion.div>
                ))}
                {filtered.length === 0 && search && (
                  <p style={{ fontSize: 14, color: '#52535a', gridColumn: '1/-1', textAlign: 'center', padding: '32px 0' }}>No servers match &ldquo;{search}&rdquo;</p>
                )}
              </div>
              {hasMore && (
                <div ref={sentinelRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, marginTop: 8 }}>
                  {Array.from({ length: Math.min(PAGE_SIZE, filtered.length - displayCount) }).map((_, i) => (
                    <div key={i} style={{ height: 64, background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  ))}
                </div>
              )}
              {!hasMore && filtered.length > 0 && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#2e2e36', marginTop: 24 }}>All {filtered.length} servers loaded</p>
              )}
            </>
          )}
        </motion.div>
      </main>

      {/* Live Feed + User Detail Slide-over */}
      <AnimatePresence>
        {feedOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setFeedOpen(false); setSelectedUser(null); }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />

            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#111113', borderLeft: '1px solid #1e1e22', zIndex: 50, display: 'flex', flexDirection: 'column' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #1e1e22', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {selectedUser && (
                    <button onClick={() => setSelectedUser(null)}
                      style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: 2 }}>
                      <ChevronLeft size={14} color="#6d6f78" />
                    </button>
                  )}
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: selectedUser ? 'rgba(88,101,242,0.15)' : 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity size={13} color="#7289da" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f2f3f5' }}>
                      {selectedUser ? selectedUser.username : 'Global Live Feed'}
                    </div>
                    <div style={{ fontSize: 11, color: '#52535a', marginTop: 1 }}>
                      {selectedUser ? 'User details & history' : (feedLoading ? 'Refreshing…' : `${feedActions.length} actions · auto-refresh 5s`)}
                    </div>
                  </div>
                </div>
                <button onClick={() => { setFeedOpen(false); setSelectedUser(null); }}
                  style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={13} color="#6d6f78" />
                </button>
              </div>

              {/* Body: feed list or user detail */}
              <AnimatePresence mode="wait">
                {selectedUser ? (
                  <motion.div key="user" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}
                    transition={{ duration: 0.18 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {renderUserDetail()}
                  </motion.div>
                ) : (
                  <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                    {feedActions.length === 0 && !feedLoading && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                        <Activity size={32} color="#2e2e36" />
                        <p style={{ fontSize: 13, color: '#52535a' }}>No moderation actions yet</p>
                      </div>
                    )}
                    {feedActions.map((a, i) => {
                      const meta = ACTION_META[a.action] ?? ACTION_META.warned;
                      const guildId = String(a.guild_id);
                      const info = guildInfos[guildId];
                      return (
                        <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 20px', borderBottom: '1px solid #18181b', transition: 'background 0.1s', cursor: 'pointer' }}
                          onClick={() => openUser(a.user_id, a.username)}
                          onMouseEnter={e => (e.currentTarget.style.background = '#18181b')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          {info?.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`https://cdn.discordapp.com/icons/${guildId}/${info.icon}.webp?size=32`} alt=""
                              style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, marginTop: 2 }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: `hsl(${parseInt(guildId.slice(-3)) % 360}, 55%, 30%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                              <Shield size={11} color="#fff" strokeWidth={2} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{a.username}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, padding: '1px 7px', borderRadius: 99, flexShrink: 0 }}>{meta.label}</span>
                              {a.action === 'warned' && <span style={{ fontSize: 10, color: '#52535a', flexShrink: 0 }}>#{a.warn_count}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: '#6d6f78', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: '#3e3e4a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info?.name ?? guildId}</span>
                              <span style={{ fontSize: 10, color: '#3e3e4a', flexShrink: 0 }}>·</span>
                              <span style={{ fontSize: 10, color: '#3e3e4a', flexShrink: 0 }}>{relTime(a.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
