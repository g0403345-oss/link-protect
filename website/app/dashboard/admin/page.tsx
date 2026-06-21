'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, Settings, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ADMIN_USER_ID } from '@/lib/admin';

interface GuildInfo { name: string; icon: string | null; }

const PAGE_SIZE = 24;

export default function AdminPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [guilds, setGuilds] = useState<string[]>([]);
  const [guildInfos, setGuildInfos] = useState<Record<string, GuildInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && session.user?.id !== ADMIN_USER_ID) {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  const fetchGuilds = useCallback(() => {
    setLoading(true);
    setDisplayCount(PAGE_SIZE);
    fetch('/api/admin/guilds')
      .then((r) => r.json())
      .then((d) => {
        setGuilds(d.guilds ?? []);
        setLoading(false);
        // Fetch names + icons in background — don't block render
        fetch('/api/admin/guilds/info')
          .then(r => r.json())
          .then(d => setGuildInfos(d.guilds ?? {}))
          .catch(() => {});
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session.user?.id === ADMIN_USER_ID) fetchGuilds();
  }, [status, session, fetchGuilds]);

  // Reset display count when search changes
  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [search]);

  const filtered = guilds.filter((id) => {
    const name = guildInfos[id]?.name ?? '';
    return id.includes(search) || name.toLowerCase().includes(search.toLowerCase());
  });

  const visible = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setDisplayCount(c => c + PAGE_SIZE); },
      { rootMargin: '200px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, visible.length]);

  if (status === 'loading' || (status === 'authenticated' && session.user?.id !== ADMIN_USER_ID)) {
    return <div style={{ minHeight: '100vh', background: '#0e0e10' }} />;
  }

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
            <button onClick={fetchGuilds} disabled={loading}
              style={{ width: 36, height: 36, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <RefreshCw size={14} color="#6d6f78" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: 20 }}>
            <Search size={14} color="#52535a" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input type="text" placeholder="Search by name or ID…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div key={i} style={{ height: 64, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.05}s` }} />
              ))}
            </div>
          )}

          {/* Guild grid */}
          {!loading && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {visible.map((guildId, i) => (
                  <motion.div key={guildId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min((i % PAGE_SIZE) * 0.015, 0.3) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, transition: 'border-color 0.15s, background 0.15s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#1e1e22'; (e.currentTarget as HTMLElement).style.background = '#111113'; }}>
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

              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div ref={sentinelRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, marginTop: 8 }}>
                  {Array.from({ length: Math.min(PAGE_SIZE, filtered.length - displayCount) }).map((_, i) => (
                    <div key={i} style={{ height: 64, background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  ))}
                </div>
              )}

              {!hasMore && filtered.length > 0 && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#2e2e36', marginTop: 24 }}>
                  All {filtered.length} servers loaded
                </p>
              )}
            </>
          )}
        </motion.div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
