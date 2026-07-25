'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BOT_INVITE, SUPPORT_SERVER, APP_STORE_URL } from '@/lib/discord';

type FLink = { label: string; href: string };

const COLUMNS: { title: string; links: FLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'What we block', href: '/#blockers' },
      { label: 'Link checker', href: '/check' },
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Changelog', href: '/update' },
    ],
  },
  {
    title: 'Get it',
    links: [
      { label: 'Add to Discord', href: BOT_INVITE },
      { label: 'iOS App', href: APP_STORE_URL },
      { label: 'Support server', href: SUPPORT_SERVER },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

function FooterLink({ label, href }: FLink) {
  const external = href.startsWith('http');
  const style: React.CSSProperties = {
    fontSize: 13, color: '#6d6f78', textDecoration: 'none', transition: 'color 0.15s',
    display: 'block', padding: '3px 0',
  };
  const onEnter = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = '#f2f3f5');
  const onLeave = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = '#6d6f78');
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>{label}</a>
  ) : (
    <Link href={href} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>{label}</Link>
  );
}

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #18181b', background: 'rgba(10,10,12,0.4)', marginTop: 'auto' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 28px' }}>
        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 32, marginBottom: 36 }}>
          {/* Brand */}
          <div>
            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 12 }}>
              <Image src="/logo.webp" alt="LinkProtect" width={26} height={26} style={{ borderRadius: 7 }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: '#f2f3f5', letterSpacing: '-0.01em' }}>LinkProtect</span>
            </Link>
            <p style={{ fontSize: 13, color: '#52535a', lineHeight: 1.6, maxWidth: 260 }}>
              Automatic link protection for Discord — phishing, scams, malware and raids, blocked before they spread.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                {col.title}
              </div>
              {col.links.map((l) => <FooterLink key={l.label} {...l} />)}
            </div>
          ))}
        </div>

        <div className="footer-row" style={{ borderTop: '1px solid #18181b', paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#52535a' }}>© 2026 Link Protect. All rights reserved.</span>
          <span style={{ fontSize: 12, color: '#52535a' }}>Not affiliated with Discord Inc.</span>
        </div>
      </div>
    </footer>
  );
}
