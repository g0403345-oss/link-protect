import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Shield, Database, ScanSearch, ShieldCheck, AlertTriangle,
  Fish, Gift, Bug, Link2, Eye,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import LinkChecker from '@/components/LinkChecker';
import { BOT_INVITE } from '@/lib/discord';

export const metadata: Metadata = {
  title: 'Is this link safe? — Link Protect URL Checker',
  description:
    'Check any Discord or web link against Link Protect\'s live threat database and Google Safe Browsing. Instantly find out if a URL is a phishing, scam, nitro or malware link.',
  alternates: { canonical: '/check' },
  openGraph: {
    title: 'Is this link safe? — Link Protect URL Checker',
    description: 'Paste a link to check it against the Link Protect threat database and Google Safe Browsing.',
  },
};

const STEPS = [
  { icon: Database, title: 'Our threat database', body: 'First we match the link against scam, phishing and malware domains caught live across thousands of Discord servers — instant and free.' },
  { icon: ScanSearch, title: 'Google Safe Browsing', body: 'If we have no record yet, the link is checked against Google Safe Browsing’s list of known-dangerous sites.' },
  { icon: ShieldCheck, title: 'Instant verdict', body: 'You get a clear safe / dangerous result, the threat category, and how many servers have already seen it.' },
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

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px', ...style }}>{children}</section>;
}

export default function CheckPage() {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 60 }}>
      <Navbar />

      {/* Hero + checker */}
      <Section style={{ paddingTop: 64, textAlign: 'center', maxWidth: 720 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#7289da', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 99, padding: '4px 12px', marginBottom: 22, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <Shield size={12} /> Free URL Checker
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 14, lineHeight: 1.05 }}>
          Is this link safe?
        </h1>
        <p style={{ fontSize: 16, color: '#6d6f78', maxWidth: 460, margin: '0 auto 30px', lineHeight: 1.6 }}>
          Paste any link to check it against the Link Protect threat database — built from real
          scams blocked across thousands of Discord servers — plus Google Safe Browsing.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <LinkChecker />
        </div>
        <p style={{ fontSize: 12, color: '#52535a', marginTop: 14 }}>
          Tip: never log in to a link you’re unsure about — check it here first.
        </p>
      </Section>

      {/* How it works */}
      <Section style={{ paddingTop: 80 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' }}>How the check works</h2>
        <p style={{ fontSize: 14, color: '#6d6f78', textAlign: 'center', marginBottom: 32 }}>Two independent sources, one clear verdict.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {STEPS.map((s, i) => (
            <div key={s.title} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(88,101,242,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={17} color="#7289da" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#52535a' }}>STEP {i + 1}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5', marginBottom: 6 }}>{s.title}</div>
              <p style={{ fontSize: 13.5, color: '#6d6f78', lineHeight: 1.55 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* What we detect */}
      <Section style={{ paddingTop: 80 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' }}>What we detect</h2>
        <p style={{ fontSize: 14, color: '#6d6f78', textAlign: 'center', marginBottom: 32 }}>The threats most likely to hit a Discord community.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {DETECTS.map((d) => (
            <div key={d.title} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: 18, display: 'flex', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${d.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <d.icon size={17} style={{ color: d.color }} />
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f2f3f5', marginBottom: 4 }}>{d.title}</div>
                <p style={{ fontSize: 13, color: '#6d6f78', lineHeight: 1.5 }}>{d.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section style={{ paddingTop: 80, maxWidth: 760 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 32, letterSpacing: '-0.02em' }}>Frequently asked</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQ.map((f) => (
            <div key={f.q} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5', marginBottom: 6 }}>{f.q}</div>
              <p style={{ fontSize: 13.5, color: '#6d6f78', lineHeight: 1.55 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section style={{ paddingTop: 80, paddingBottom: 96, maxWidth: 720 }}>
        <div style={{ padding: '32px 24px', background: 'linear-gradient(180deg, rgba(88,101,242,0.08), transparent)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 16, textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', marginBottom: 8 }}>Stop these links automatically</h2>
          <p style={{ fontSize: 14, color: '#6d6f78', marginBottom: 20, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            Link Protect blocks phishing, nitro scams, malware and unwanted invites across your whole
            Discord server — automatically, and for free.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={BOT_INVITE} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 14, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none' }}>
              Add to your server
            </a>
            <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 14, fontWeight: 600, color: '#949ba4', border: '1px solid #2e2e36', borderRadius: 10, textDecoration: 'none' }}>
              Open dashboard
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
