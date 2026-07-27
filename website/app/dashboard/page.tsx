'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Search, RefreshCw, Plus, Settings, ExternalLink, Shield, Flame, LayoutList, LayoutGrid, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import type { EnrichedGuild } from '@/app/api/guilds/route';
import type { GuildOverviewEntry } from '@/lib/db';
import { BOT_INVITE } from '@/lib/discord';

type ViewMode = 'list' | 'poster';

/* Tiny inline 7-day activity sparkline (SVG, no lib). */
function Sparkline({ data, width = 78, height = 22, color = '#5865f2' }: {
  data: number[]; width?: number; height?: number; color?: string;
}) {
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1 || 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 6)).toFixed(1)}`);
  const flat = data.every((v) => v === 0);
  if (flat) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line x1={0} y1={height - 3} x2={width} y2={height - 3} stroke="#2e2e36" strokeWidth={1.5} strokeDasharray="3 3" />
      </svg>
    );
  }
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={color} opacity={0.12} />
    </svg>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [guilds, setGuilds] = useState<EnrichedGuild[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading');
  const [search, setSearch] = useState('');
  const [overview, setOverview] = useState<Record<string, GuildOverviewEntry>>({});
  const [view, setView] = useState<ViewMode>('list');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lp_dash_view');
      if (saved === 'poster' || saved === 'list') setView(saved);
    } catch { /* ignore */ }
  }, []);

  const switchView = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem('lp_dash_view', v); } catch { /* ignore */ }
  };

  // Stale-while-revalidate via sessionStorage: repeat visits paint the full
  // list (and sparklines) instantly from cache, then refresh in the background
  // — the page never waits on Discord round-trips to show something.
  const fetchGuilds = (background = false) => {
    if (!background) setLoadState('loading');
    fetch('/api/guilds')
      .then((r) => {
        if (r.status === 401) {
          // Discord token expired and couldn't be refreshed — re-run the OAuth
          // redirect (silent for already-authorized users) instead of erroring.
          signIn('discord');
          throw new Error('reauth');
        }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: EnrichedGuild[]) => {
        setGuilds(d);
        setLoadState('success');
        try { sessionStorage.setItem('lp_guilds_v1', JSON.stringify(d)); } catch { /* ignore */ }
        const ids = d.filter((g) => g.botPresent).map((g) => g.id);
        if (ids.length) {
          fetch('/api/me/overview', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((o) => {
              if (o?.guilds) {
                setOverview(o.guilds);
                try { sessionStorage.setItem('lp_overview_v1', JSON.stringify(o.guilds)); } catch { /* ignore */ }
              }
            })
            .catch(() => { /* sparklines are progressive enhancement */ });
        }
      })
      .catch(() => { if (!background) setLoadState('error'); });
  };

  useEffect(() => {
    if (status === 'authenticated') {
      let cached = false;
      try {
        const g = sessionStorage.getItem('lp_guilds_v1');
        if (g) {
          setGuilds(JSON.parse(g) as EnrichedGuild[]);
          setLoadState('success');
          cached = true;
        }
        const o = sessionStorage.getItem('lp_overview_v1');
        if (o) setOverview(JSON.parse(o));
      } catch { /* corrupt cache — fall through to a normal load */ }
      fetchGuilds(cached);
    } else if (status === 'unauthenticated') setLoadState('success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = guilds.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  const botServers = filtered.filter((g) => g.botPresent);
  const otherServers = filtered.filter((g) => !g.botPresent);

  // Aggregate across every protected server (unfiltered — the summary should
  // not change while searching).
  const totals = useMemo(() => {
    const entries = guilds.filter((g) => g.botPresent).map((g) => overview[g.id]).filter(Boolean);
    if (!entries.length) return null;
    const week = entries.reduce((s, e) => s + e.last7.reduce((a, b) => a + b, 0), 0);
    const last7 = Array.from({ length: 7 }, (_, i) => entries.reduce((s, e) => s + (e.last7[i] ?? 0), 0));
    let busiest: { id: string; count: number } | null = null;
    for (const g of guilds) {
      const e = overview[g.id];
      if (!e) continue;
      const c = e.last7.reduce((a, b) => a + b, 0);
      if (!busiest || c > busiest.count) busiest = { id: g.id, count: c };
    }
    return {
      servers: entries.length,
      warnings: entries.reduce((s, e) => s + e.totalWarnings, 0),
      today: entries.reduce((s, e) => s + e.today, 0),
      week,
      last7,
      busiest: busiest && busiest.count > 0 ? { ...busiest, name: guilds.find((g) => g.id === busiest!.id)?.name ?? '' } : null,
    };
  }, [guilds, overview]);

  if (status === 'unauthenticated') {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent' }} className="dot-grid">
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <Image src="/logo.webp" alt="Link Protect" width={64} height={64} style={{ borderRadius: 16, margin: '0 auto 24px', display: 'block' }} />
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', marginBottom: 8, letterSpacing: '-0.02em' }}>Sign in to continue</h1>
            <p style={{ fontSize: 14, color: '#52535a', marginBottom: 28 }}>Connect with your Discord account to manage your servers.</p>
            <button onClick={() => signIn('discord')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
              Continue with Discord
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <Navbar />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 60px' }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                {session?.user?.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                )}
                <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em' }}>
                  {session?.user?.name ? `${session.user.name}'s servers` : 'Your servers'}
                </h1>
              </div>
              <p style={{ fontSize: 13, color: '#52535a' }}>Select a server to manage Link Protect settings</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'inline-flex', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: 3, gap: 2 }}>
                {([['list', LayoutList], ['poster', LayoutGrid]] as const).map(([id, Icon]) => (
                  <button key={id} onClick={() => switchView(id)} title={id === 'list' ? 'List view' : 'Poster view'}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', background: view === id ? 'rgba(88,101,242,0.2)' : 'transparent', color: view === id ? '#96a4ff' : '#52535a' }}>
                    <Icon size={14} />
                  </button>
                ))}
              </div>
              <button onClick={() => fetchGuilds()} disabled={loadState === 'loading'}
                style={{ width: 36, height: 36, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <RefreshCw size={14} color="#6d6f78" style={{ animation: loadState === 'loading' ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              <a href={BOT_INVITE} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#5865f2', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>
                <Plus size={14} /> Add to Server
              </a>
            </div>
          </div>

          {/* All-servers aggregate — skeleton keeps the layout stable while
              the batch stats load, so nothing jumps into place late. */}
          {!totals && loadState === 'success' && guilds.some((g) => g.botPresent) && (
            <div className="overview-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 62, background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          )}
          {totals && (
            <div className="overview-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Protected servers', value: totals.servers, icon: Shield, color: '#23a55a' },
                { label: 'Threats stopped (all time)', value: totals.warnings, icon: Flame, color: '#f0b232' },
                { label: 'Actions today', value: totals.today, icon: TrendingUp, color: '#5865f2' },
              ].map((t) => (
                <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${t.color}16`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <t.icon size={15} style={{ color: t.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{t.value.toLocaleString()}</div>
                    <div style={{ fontSize: 10.5, color: '#52535a', fontWeight: 600 }}>{t.label}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{totals.week.toLocaleString()}</div>
                  <div style={{ fontSize: 10.5, color: '#52535a', fontWeight: 600 }}>
                    Actions, 7 days{totals.busiest ? ` · most: ${totals.busiest.name}` : ''}
                  </div>
                </div>
                <Sparkline data={totals.last7} width={92} height={30} />
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 360 }}>
            <Search size={14} color="#52535a" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input type="text" placeholder="Search servers..." value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
          </div>
        </motion.div>

        {/* Loading */}
        {loadState === 'loading' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: view === 'poster' ? 180 : 72, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {/* Error */}
        {loadState === 'error' && (
          <div style={{ padding: '12px 16px', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 8, fontSize: 13, color: '#f23f43', display: 'flex', gap: 10 }}>
            Failed to load servers.
            <button onClick={() => fetchGuilds()} style={{ background: 'none', border: 'none', color: '#f23f43', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
          </div>
        )}

        {/* Bot servers */}
        {loadState === 'success' && botServers.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#23a55a' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Protected ({botServers.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: view === 'poster' ? 'repeat(auto-fill, minmax(210px, 1fr))' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: view === 'poster' ? 12 : 8 }}>
              {botServers.map((guild, i) => view === 'poster'
                ? <GuildPoster key={guild.id} guild={guild} index={i} stats={overview[guild.id]} />
                : <GuildRow key={guild.id} guild={guild} index={i} stats={overview[guild.id]} />)}
            </div>
          </div>
        )}

        {/* Other servers */}
        {loadState === 'success' && otherServers.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#52535a' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Not added ({otherServers.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: view === 'poster' ? 'repeat(auto-fill, minmax(210px, 1fr))' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: view === 'poster' ? 12 : 8 }}>
              {otherServers.map((guild, i) => view === 'poster'
                ? <GuildPoster key={guild.id} guild={guild} index={i} />
                : <GuildRow key={guild.id} guild={guild} index={i} />)}
            </div>
          </div>
        )}

        {/* Empty states */}
        {loadState === 'success' && guilds.length > 0 && filtered.length === 0 && (
          <p style={{ fontSize: 14, color: '#52535a', textAlign: 'center', padding: '40px 0' }}>No servers match &ldquo;{search}&rdquo;</p>
        )}
        {loadState === 'success' && guilds.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#f2f3f5', marginBottom: 8 }}>No servers found</p>
            <p style={{ fontSize: 14, color: '#52535a' }}>You need Manage Server permission to configure Link Protect.</p>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

function GuildRow({ guild, index, stats }: { guild: EnrichedGuild; index: number; stats?: GuildOverviewEntry }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.03 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, transition: 'border-color 0.15s, background 0.15s' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#1e1e22'; (e.currentTarget as HTMLElement).style.background = '#111113'; }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={guild.iconUrl} alt={guild.name} style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', display: 'block' }}
            onError={(e) => {
              const t = e.currentTarget; t.style.display = 'none';
              const d = document.createElement('div');
              d.style.cssText = 'width:40px;height:40px;border-radius:10px;background:#5865f2;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff';
              d.textContent = guild.name[0].toUpperCase();
              t.parentElement?.appendChild(d);
            }}
          />
          <span style={{ position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: guild.botPresent ? '#23a55a' : '#52535a', border: '2px solid #111113' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sparkline lives in the meta row below the name — as a flex sibling
              it squeezed names down to one letter on 3-column layouts. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{guild.name}</span>
            {stats?.premium && <span title="Link Protect Premium" style={{ fontSize: 10, fontWeight: 700, color: '#96a4ff', background: 'rgba(88,101,242,0.14)', border: '1px solid rgba(88,101,242,0.3)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>💎 Premium</span>}
            {guild.owner && <span style={{ fontSize: 10, fontWeight: 600, color: '#f0b232', background: 'rgba(240,178,50,0.12)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>Owner</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {guild.approximate_member_count != null && (
              <span style={{ fontSize: 11, color: '#52535a', whiteSpace: 'nowrap' }}>{guild.approximate_member_count.toLocaleString()} members</span>
            )}
            {stats && (
              <span title={`${stats.last7.reduce((a, b) => a + b, 0)} actions in the last 7 days`} style={{ display: 'inline-flex', minWidth: 0, overflow: 'hidden' }}>
                <Sparkline data={stats.last7} width={56} height={14} />
              </span>
            )}
          </div>
        </div>
        {guild.botPresent ? (
          <Link href={`/dashboard/${guild.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#5865f2', color: '#fff', borderRadius: 7, textDecoration: 'none', flexShrink: 0 }}>
            <Settings size={12} /> Manage
          </Link>
        ) : (
          <a href={`${BOT_INVITE}&guild_id=${guild.id}`} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#18181b', color: '#949ba4', borderRadius: 7, textDecoration: 'none', flexShrink: 0, border: '1px solid #2e2e36' }}>
            <ExternalLink size={12} /> Add Bot
          </a>
        )}
      </div>
    </motion.div>
  );
}

/* Poster view: tall card — the server icon becomes a blurred backdrop, stats
 * and sparkline live on top. */
function GuildPoster({ guild, index, stats }: { guild: EnrichedGuild; index: number; stats?: GuildOverviewEntry }) {
  const inner = (
    // isolation + the translateZ'd clip layer below keep the blurred backdrop
    // inside the rounded corners — Safari otherwise paints it square.
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', isolation: 'isolate', WebkitMaskImage: '-webkit-radial-gradient(white, black)', border: '1px solid #1e1e22', background: '#111113', height: 200, display: 'flex', flexDirection: 'column', transition: 'transform 0.18s, border-color 0.18s, box-shadow 0.18s' }}
      onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-3px)'; el.style.borderColor = '#5865f2'; el.style.boxShadow = '0 12px 32px rgba(88,101,242,0.18)'; }}
      onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.transform = 'none'; el.style.borderColor = '#1e1e22'; el.style.boxShadow = 'none'; }}>
      {/* Blurred icon backdrop, clipped in its own rounded layer */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden', transform: 'translateZ(0)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={guild.iconUrl} alt=""
          style={{ position: 'absolute', inset: -20, width: 'calc(100% + 40px)', height: 'calc(100% + 40px)', objectFit: 'cover', filter: 'blur(28px) saturate(1.4)', opacity: 0.35 }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,10,12,0.25) 0%, rgba(10,10,12,0.88) 78%)' }} />
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 14px 0' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={guild.iconUrl} alt={guild.name}
          style={{ width: 62, height: 62, borderRadius: 16, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
          onError={(e) => {
            const t = e.currentTarget; t.style.display = 'none';
            const d = document.createElement('div');
            d.style.cssText = 'width:62px;height:62px;border-radius:16px;background:#5865f2;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;border:2px solid rgba(255,255,255,0.12)';
            d.textContent = guild.name[0].toUpperCase();
            t.parentElement?.insertBefore(d, t);
          }} />
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: '#f2f3f5', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {guild.name}{stats?.premium ? ' 💎' : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: guild.botPresent ? '#23a55a' : '#949ba4', background: guild.botPresent ? 'rgba(35,165,90,0.14)' : 'rgba(148,155,164,0.1)', padding: '2px 8px', borderRadius: 99 }}>
            <Shield size={9} /> {guild.botPresent ? 'Protected' : 'Not added'}
          </span>
          {guild.owner && <span style={{ fontSize: 10, fontWeight: 700, color: '#f0b232', background: 'rgba(240,178,50,0.14)', padding: '2px 8px', borderRadius: 99 }}>Owner</span>}
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 12px', gap: 8 }}>
        {stats ? (
          <>
            <div style={{ fontSize: 10.5, color: '#949ba4', lineHeight: 1.5 }}>
              <b style={{ color: '#f2f3f5' }}>{stats.totalWarnings.toLocaleString()}</b> threats stopped<br />
              <b style={{ color: '#f2f3f5' }}>{stats.activeBlockers}</b> blockers active
            </div>
            <Sparkline data={stats.last7} width={70} height={26} />
          </>
        ) : guild.approximate_member_count != null ? (
          <span style={{ fontSize: 11, color: '#6d6f78' }}>{guild.approximate_member_count.toLocaleString()} members</span>
        ) : <span />}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.03 }}>
      {guild.botPresent ? (
        <Link href={`/dashboard/${guild.id}`} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
      ) : (
        <a href={`${BOT_INVITE}&guild_id=${guild.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'block' }}>{inner}</a>
      )}
    </motion.div>
  );
}
