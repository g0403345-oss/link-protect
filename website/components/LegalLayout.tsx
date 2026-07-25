import Link from 'next/link';
import { ChevronLeft, Scale } from 'lucide-react';
import Navbar from '@/components/Navbar';

export function LegalLayout({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'transparent', position: 'relative' }}>
      <div aria-hidden className="dot-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 380, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)', pointerEvents: 'none' }} />
      <Navbar />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '120px 24px 96px', position: 'relative' }}>
        <Link
          href="/"
          className="no-print"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#52535a', textDecoration: 'none', marginBottom: 28 }}
        >
          <ChevronLeft size={14} /> Back to home
        </Link>

        <div className="eyebrow" style={{ marginBottom: 18 }}>
          <Scale size={12} /> Legal
        </div>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 40px)', fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.03em', marginBottom: 8, lineHeight: 1.1 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: '#52535a', marginBottom: 28 }}>Last updated: {updated}</p>

        <p style={{ fontSize: 15, lineHeight: 1.7, color: '#b5bac1', marginBottom: 8 }}>{intro}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 28 }}>
          {children}
        </div>

        <div className="no-print" style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #1e1e22', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {[
            { href: '/privacy', label: 'Privacy Policy' },
            { href: '/terms', label: 'Terms of Service' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="legal-link" style={{ fontSize: 13, color: '#96a4ff', textDecoration: 'none' }}>{label}</Link>
          ))}
          <a href="https://discord.gg/BjDC9t329E" target="_blank" rel="noreferrer" className="legal-link" style={{ fontSize: 13, color: '#96a4ff', textDecoration: 'none' }}>Support</a>
        </div>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f2f3f5', letterSpacing: '-0.01em', marginBottom: 10 }}>
        {heading}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: '#949ba4', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

/** A simple unordered list styled for the dark theme. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ color: '#949ba4', lineHeight: 1.6 }}>{item}</li>
      ))}
    </ul>
  );
}
