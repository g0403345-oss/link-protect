'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, LayoutDashboard, ChevronDown, Shield } from 'lucide-react';
import { isAdmin } from '@/lib/admin';
import { BOT_INVITE, SUPPORT_SERVER } from '@/lib/discord';
import { SupporterBadge, rankMeta } from '@/components/SupporterBadge';

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const inDashboard = pathname?.startsWith('/dashboard') ?? false;
  // In the dashboard the marketing anchors are meaningless — show working,
  // context-appropriate links instead. Elsewhere the anchors point at the
  // landing page absolutely so they work from any route (e.g. /check).
  const navLinks = inDashboard
    ? [
        { label: 'My servers', href: '/dashboard' },
        { label: 'Link checker', href: '/check' },
        { label: 'Support', href: SUPPORT_SERVER },
      ]
    : [
        { label: 'Features', href: '/#features' },
        { label: 'What we block', href: '/#blockers' },
        { label: 'Link checker', href: '/check' },
        { label: 'Support', href: SUPPORT_SERVER },
      ];
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Voter status drives the pill's medal colour + Supporter badge.
  const [vote, setVote] = useState<{ rank: number | null; supporter: boolean } | null>(null);
  useEffect(() => {
    if (!session?.user?.id) { setVote(null); return; }
    fetch('/api/me/vote')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setVote({ rank: d.rank ?? null, supporter: !!d.supporter }); })
      .catch(() => {});
  }, [session?.user?.id]);
  const pillMeta = rankMeta(vote?.rank ?? null);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      transition: 'background 0.25s, border-color 0.25s',
      background: scrolled ? 'rgba(14,14,16,0.92)' : 'transparent',
      borderBottom: scrolled ? '1px solid #2e2e36' : '1px solid transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', gap: 32 }}>

        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <Image src="/logo.webp" alt="LinkProtect" width={30} height={30} style={{ borderRadius: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#f2f3f5', letterSpacing: '-0.01em' }}>LinkProtect</span>
        </Link>

        {/* Center links */}
        <div className="nav-center-links" style={{ display: 'flex', gap: 2, flex: 1 }}>
          {navLinks.map((link) => {
            const external = link.href.startsWith('http');
            const active = !external && (pathname === link.href ||
              (link.href === '/dashboard' && inDashboard));
            const style: React.CSSProperties = { padding: '6px 12px', fontSize: 14, fontWeight: 500, color: active ? '#f2f3f5' : '#6d6f78', textDecoration: 'none', borderRadius: 6, transition: 'color 0.15s' };
            const onEnter = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = '#f2f3f5');
            const onLeave = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = active ? '#f2f3f5' : '#6d6f78');
            return external ? (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer" style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {link.label}
              </a>
            ) : (
              <Link key={link.label} href={link.href} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {session ? (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(!menuOpen)}
                className={pillMeta?.animated ? 'lp-gold-anim' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: '#18181b', border: `1px solid ${pillMeta ? pillMeta.color : '#2e2e36'}`, borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s', boxShadow: pillMeta ? `0 0 10px ${pillMeta.glow}` : undefined }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = pillMeta ? pillMeta.color : '#52535a')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = pillMeta ? pillMeta.color : '#2e2e36')}>
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                ) : (
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    {session.user?.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.user?.name}
                </span>
                {vote?.supporter && <SupporterBadge size={12} />}
                <ChevronDown size={14} color="#6d6f78" style={{ transition: 'transform 0.15s', transform: menuOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {menuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, padding: 4, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 200 }}>
                  <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, fontWeight: 500, color: '#b5bac1', textDecoration: 'none', borderRadius: 6, transition: 'background 0.1s, color 0.1s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#232329'; (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#b5bac1'; }}>
                    <LayoutDashboard size={14} />
                    Dashboard
                  </Link>
                  {isAdmin(session.user?.id) && (
                    <Link href="/dashboard/admin" onClick={() => setMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, fontWeight: 500, color: '#f0b232', textDecoration: 'none', borderRadius: 6, transition: 'background 0.1s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(240,178,50,0.08)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <Shield size={14} />
                      Admin Panel
                    </Link>
                  )}
                  <div style={{ height: 1, background: '#2e2e36', margin: '4px 0' }} />
                  <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/' }); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, fontWeight: 500, color: '#f23f43', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(242,63,67,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <LogOut size={14} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login"
                style={{ padding: '7px 14px', fontSize: 14, fontWeight: 500, color: '#6d6f78', textDecoration: 'none', borderRadius: 8, transition: 'color 0.15s' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f2f3f5')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#6d6f78')}>
                Log in
              </Link>
              <a href={BOT_INVITE} target="_blank" rel="noreferrer"
                style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, background: '#5865f2', color: '#fff', borderRadius: 8, textDecoration: 'none', transition: 'background 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#4752c4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#5865f2')}>
                Add to Discord
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
