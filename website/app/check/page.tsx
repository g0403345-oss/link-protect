import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Shield, Database, ScanSearch, ShieldCheck, AlertTriangle,
  Fish, Gift, Bug, Link2, Eye,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import LinkChecker from '@/components/LinkChecker';
import { BOT_INVITE } from '@/lib/discord';

// Shared results (/check?url=…) get a dynamic OG card showing the actual
// verdict — a warning link posted in Discord previews as a red warning card.
export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ url?: string | string[] }> },
): Promise<Metadata> {
  const params = await searchParams;
  const shared = typeof params.url === 'string' ? params.url.slice(0, 300) : '';
  const base: Metadata = {
    title: 'Is this link safe? — Link Protect URL Checker',
    description:
      'Check any Discord or web link against Link Protect\'s live threat database and Google Safe Browsing. Instantly find out if a URL is a phishing, scam, nitro or malware link.',
    alternates: { canonical: '/check' },
    openGraph: {
      title: 'Is this link safe? — Link Protect URL Checker',
      description: 'Paste a link to check it against the Link Protect threat database and Google Safe Browsing.',
    },
  };
  if (!shared) return base;
  const og = `/api/og/check?url=${encodeURIComponent(shared)}`;
  return {
    ...base,
    title: 'Link check result — Link Protect',
    openGraph: {
      title: 'Link check result — Link Protect',
      description: 'Live verdict from the Link Protect threat database.',
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', images: [og] },
  };
}

const STEPS = [
  { icon: Database, title: 'Our threat database', body: 'The link is matched against scam, phishing and malware domains caught live across thousands of Discord servers.' },
  { icon: Link2, title: 'Redirects unwrapped', body: 'Shorteners like bit.ly hide their target. We follow the full redirect chain server-side and check every hop.' },
  { icon: ScanSearch, title: 'Google Safe Browsing', body: 'The link and its final destination are also checked against Google’s list of known-dangerous sites.' },
  { icon: ShieldCheck, title: 'Instant verdict', body: 'A clear safe / dangerous result, why it matters, and a shareable link to warn others with one click.' },
];

const DETECTS = [
  { icon: Fish, color: '#eb459e', title: 'Phishing', body: 'Fake login pages built to steal Discord, Steam or bank credentials.' },
  { icon: Gift, color: '#f0b232', title: 'Nitro scams', body: '“Free Nitro” bait that hijacks accounts the moment you log in.' },
  { icon: Bug, color: '#f23f43', title: 'Malware', body: 'Drive-by downloads and malicious files disguised as something useful.' },
  { icon: Eye, color: '#5865f2', title: 'Look-alike domains', body: 'Homoglyph & punycode spoofs like dіscord.com that mimic real brands.' },
  { icon: Link2, color: '#00a8fc', title: 'Shorteners & redirects', body: 'Hidden destinations behind bit.ly and other URL shorteners.' },
  { icon: AlertTriangle, color: '#23a55a', title: 'Circulating links', body: 'See whether a link is actively spreading across Discord right now.' },
];

const FAQ = [
  { q: 'Is the checker free?', a: 'Completely free, with no account required. Paste a link and go.' },
  { q: 'Do you store the links I check?', a: 'We cache verdicts so repeat checks stay instant, but we never record who checked what — no personal data is stored.' },
  { q: 'A safe link got flagged — what now?', a: 'Google Safe Browsing and our database are very accurate, but if you think a result is wrong you can report it from your dashboard, and server admins can allowlist the domain.' },
  { q: 'How is the threat database built?', a: 'From the real links the Link Protect bot blocks across thousands of Discord servers, combined with imported public threat feeds.' },
];

function Shell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px', ...style }}>{children}</section>;
}

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ url?: string | string[] }> }) {
  // Shared result links (/check?url=…) pre-fill the checker and auto-run.
  const params = await searchParams;
  const sharedUrl = typeof params.url === 'string' ? params.url.slice(0, 500) : '';
  return (
    <div style={{ minHeight: '100vh', paddingTop: 60, position: 'relative' }}>
      <div aria-hidden className="dot-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      <Navbar />

      {/* ── Hero: checker left, how-it-works rail right ── */}
      <Shell style={{ paddingTop: 72 }}>
        <div className="split-hero">
          <div>
            <div className="eyebrow" style={{ marginBottom: 20 }}>
              <Shield size={12} /> Free URL Checker
            </div>
            <h1 style={{ fontSize: 'clamp(34px, 4.6vw, 54px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 14, lineHeight: 1.04 }}>
              Is this link safe?
            </h1>
            <p style={{ fontSize: 15.5, color: '#949ba4', maxWidth: 500, lineHeight: 1.65, marginBottom: 30 }}>
              Paste any link to check it against the Link Protect threat database — built from real
              scams blocked across thousands of Discord servers — plus Google Safe Browsing.
            </p>
            <LinkChecker detailed fluid initialUrl={sharedUrl} />
            <p style={{ fontSize: 12, color: '#52535a', marginTop: 14 }}>
              Tip: never log in to a link you&rsquo;re unsure about — check it here first.
            </p>
          </div>

          {/* Numbered vertical rail — replaces a whole row of step cards */}
          <div style={{ borderLeft: '1px solid #1e1e22', paddingLeft: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#52535a', marginBottom: 18 }}>How the check works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {STEPS.map((s, i) => (
                <div key={s.title} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: i === STEPS.length - 1 ? 0 : 24 }}>
                  {i < STEPS.length - 1 && (
                    <div aria-hidden style={{ position: 'absolute', left: 15, top: 34, bottom: 2, width: 1, background: 'linear-gradient(to bottom, #2e2e36, #1a1a1e)' }} />
                  )}
                  <div style={{ width: 31, height: 31, borderRadius: 9, background: 'rgba(88,101,242,0.12)', border: '1px solid rgba(88,101,242,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    <s.icon size={15} color="#96a4ff" />
                  </div>
                  <div style={{ paddingTop: 3 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f2f3f5', marginBottom: 4 }}>
                      <span style={{ color: '#52535a', fontWeight: 800, fontSize: 11.5, marginRight: 7 }}>0{i + 1}</span>{s.title}
                    </div>
                    <p style={{ fontSize: 12.5, color: '#6d6f78', lineHeight: 1.55 }}>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Shell>

      {/* ── What we detect: open tiles, full width ── */}
      <Shell style={{ paddingTop: 96 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', borderBottom: '1px solid #1e1e22', paddingBottom: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em' }}>What we detect</h2>
          <p style={{ fontSize: 13, color: '#6d6f78' }}>The threats most likely to hit a Discord community.</p>
        </div>
        <div className="detect-3col">
          {DETECTS.map((d) => (
            <div key={d.title} className="card-hover" style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${d.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <d.icon size={16} style={{ color: d.color }} />
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f2f3f5' }}>{d.title}</div>
              </div>
              <p style={{ fontSize: 13, color: '#6d6f78', lineHeight: 1.55 }}>{d.body}</p>
            </div>
          ))}
        </div>
      </Shell>

      {/* ── FAQ: two columns ── */}
      <Shell style={{ paddingTop: 84 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', marginBottom: 20, letterSpacing: '-0.02em' }}>Frequently asked</h2>
        <div className="faq-2col">
          {FAQ.map((f) => (
            <div key={f.q} className="card-hover" style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: '18px 22px' }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f2f3f5', marginBottom: 7 }}>{f.q}</div>
              <p style={{ fontSize: 13, color: '#6d6f78', lineHeight: 1.6 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </Shell>

      {/* ── CTA: horizontal band ── */}
      <Shell style={{ paddingTop: 72, paddingBottom: 96 }}>
        <div className="cta-band" style={{ padding: '28px 32px', background: 'linear-gradient(120deg, rgba(88,101,242,0.10), rgba(88,101,242,0.02))', border: '1px solid rgba(88,101,242,0.22)', borderRadius: 16 }}>
          <div style={{ minWidth: 260 }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, color: '#f2f3f5', marginBottom: 6 }}>Stop these links automatically</h2>
            <p style={{ fontSize: 13.5, color: '#949ba4', lineHeight: 1.6, maxWidth: 520 }}>
              Link Protect blocks phishing, nitro scams, malware and unwanted invites across your
              whole Discord server — automatically, and for free.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={BOT_INVITE} target="_blank" rel="noreferrer" className="btn-primary" style={{ fontSize: 14 }}>
              Add to your server
            </a>
            <Link href="/dashboard" className="btn-secondary" style={{ fontSize: 14 }}>
              Open dashboard
            </Link>
          </div>
        </div>
      </Shell>
    </div>
  );
}
