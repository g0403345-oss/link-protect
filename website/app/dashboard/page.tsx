'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Search, RefreshCw, Plus, Settings, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import type { EnrichedGuild } from '@/app/api/guilds/route';
import { BOT_INVITE } from '@/lib/discord';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [guilds, setGuilds] = useState<EnrichedGuild[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading');
  const [search, setSearch] = useState('');

  const fetchGuilds = () => {
    setLoadState('loading');
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
      .then((d: EnrichedGuild[]) => { setGuilds(d); setLoadState('success'); })
      .catch(() => setLoadState('error'));
  };

  useEffect(() => {
    if (status === 'authenticated') fetchGuilds();
    else if (status === 'unauthenticated') setLoadState('success');
  }, [status]);

  const filtered = guilds.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
  const botServers = filtered.filter((g) => g.botPresent);
  const otherServers = filtered.filter((g) => !g.botPresent);

  if (status === 'unauthenticated') {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent' }} className="dot-grid">
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <Image src="/logo.webp" alt="LinkProtect" width={64} height={64} style={{ borderRadius: 16, margin: '0 auto 24px', display: 'block' }} />
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
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginBottom: 28 }}>
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
              <p style={{ fontSize: 13, color: '#52535a' }}>Select a server to manage LinkProtect settings</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fetchGuilds} disabled={loadState === 'loading'}
                style={{ width: 36, height: 36, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <RefreshCw size={14} color="#6d6f78" style={{ animation: loadState === 'loading' ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              <a href={BOT_INVITE} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: '#5865f2', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>
                <Plus size={14} /> Add to Server
              </a>
            </div>
          </div>

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
              <div key={i} style={{ height: 72, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {/* Error */}
        {loadState === 'error' && (
          <div style={{ padding: '12px 16px', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 8, fontSize: 13, color: '#f23f43', display: 'flex', gap: 10 }}>
            Failed to load servers.
            <button onClick={fetchGuilds} style={{ background: 'none', border: 'none', color: '#f23f43', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
          </div>
        )}

        {/* Bot servers */}
        {loadState === 'success' && botServers.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#23a55a' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Protected ({botServers.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {botServers.map((guild, i) => <GuildRow key={guild.id} guild={guild} index={i} />)}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {otherServers.map((guild, i) => <GuildRow key={guild.id} guild={guild} index={i} />)}
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
            <p style={{ fontSize: 14, color: '#52535a' }}>You need Manage Server permission to configure LinkProtect.</p>
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

function GuildRow({ guild, index }: { guild: EnrichedGuild; index: number }) {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guild.name}</span>
            {guild.owner && <span style={{ fontSize: 10, fontWeight: 600, color: '#f0b232', background: 'rgba(240,178,50,0.12)', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>Owner</span>}
          </div>
          {guild.approximate_member_count != null && (
            <span style={{ fontSize: 11, color: '#52535a' }}>{guild.approximate_member_count.toLocaleString()} members</span>
          )}
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
