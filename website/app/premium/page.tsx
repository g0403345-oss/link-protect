import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Gem, ShieldCheck, Palette, Gavel, Code2, ArrowRight, Check,
} from 'lucide-react';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Premium — Everything free, forever. Premium adds polish.',
  description:
    'Link Protect Premium: 3,49 €/month or 29 €/year per server. Custom embeds, welcome messages, white-label verify page, watchlist, night schedule, one-click undo and 10× API limits. Every protection feature stays free forever.',
  alternates: { canonical: '/premium' },
  openGraph: {
    title: 'Link Protect Premium',
    description:
      'Every protection feature is free forever. Premium adds personalization, moderation comfort and developer headroom — 3,49 €/month per server.',
  },
};

const PERK_GROUPS: { icon: typeof Palette; title: string; tagline: string; items: string[] }[] = [
  {
    icon: Palette,
    title: 'Personalize',
    tagline: 'Make the bot feel like part of your server.',
    items: [
      'Your embed color & custom footer on info embeds',
      'Welcome & leave messages',
      'Templates up to 1,500 characters',
      'Verify page with your logo & rules gate',
      'Vanity link — /verify/your-server',
      'White-label verify page (no Link Protect branding)',
    ],
  },
  {
    icon: Gavel,
    title: 'Moderate',
    tagline: 'Comfort features for busy mod teams.',
    items: [
      'Watchlist with instant alerts',
      'Night schedule & event mode',
      'One-click undo for false positives',
      'Sync settings to up to 25 servers',
    ],
  },
  {
    icon: Code2,
    title: 'Develop',
    tagline: 'Headroom for your own integrations.',
    items: [
      '600 API requests/min (10×)',
      '20 API keys',
      '10 webhooks',
    ],
  },
];

const FAQ = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes — manage or cancel your subscription anytime via the Stripe customer portal, reachable from your server’s Overview tab. No emails, no waiting.',
  },
  {
    q: 'Is Premium per server or per account?',
    a: 'Per server. Each server you upgrade gets its own subscription, so you only pay for the communities that need the extras.',
  },
  {
    q: 'What happens when my subscription lapses?',
    a: 'Premium perks pause, but every setting is kept — your templates, colors and watchlist are all waiting if you resubscribe. Protection itself is unaffected, because it was never behind a paywall.',
  },
  {
    q: 'Do my colors apply to moderation embeds too?',
    a: 'No, and that’s deliberate: your color and footer apply to welcome, verify and info embeds, while moderation embeds keep their red and yellow warning colors so alerts stay unmistakable.',
  },
];

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px', ...style }}>{children}</section>;
}

export default function PremiumPage() {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 60, position: 'relative' }}>
      <div aria-hidden className="dot-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      <Navbar />

      {/* Hero */}
      <Section style={{ paddingTop: 64, textAlign: 'center', maxWidth: 760 }}>
        <div className="eyebrow" style={{ marginBottom: 22 }}>
          <Gem size={12} /> Link Protect Premium
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 14, lineHeight: 1.05 }}>
          Everything free, forever.<br />Premium adds polish.
        </h1>
        <p style={{ fontSize: 16, color: '#6d6f78', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          Protection is not a paid feature. Premium is for teams that want the bot to look, feel and
          scale like their own.
        </p>
      </Section>

      {/* Free-forever pledge */}
      <Section style={{ paddingTop: 40, maxWidth: 760 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(35,165,90,0.06)', border: '1px solid rgba(35,165,90,0.2)', borderRadius: 14, padding: '18px 22px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(35,165,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={17} color="#23a55a" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5', marginBottom: 4 }}>Our free-forever pledge</div>
            <p style={{ fontSize: 13.5, color: '#949ba4', lineHeight: 1.6 }}>
              All 16 link blockers, warnings, Scam Shield, lockdown, the dashboard and the iOS app are
              free — forever, for every server. No protection feature will ever move behind a paywall.
            </p>
          </div>
        </div>
      </Section>

      {/* Price */}
      <Section style={{ paddingTop: 48, maxWidth: 560 }}>
        <div style={{ background: '#111113', border: '1px solid rgba(88,101,242,0.3)', borderRadius: 16, padding: '28px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 44, fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.04em' }}>3,49&nbsp;€</span>
            <span style={{ fontSize: 15, color: '#6d6f78', fontWeight: 600 }}>/month</span>
          </div>
          <div style={{ fontSize: 14, color: '#949ba4', marginBottom: 16 }}>
            or <strong style={{ color: '#f2f3f5' }}>29&nbsp;€/year</strong> — per server, billed via Stripe
          </div>
          <Link href="/dashboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none' }}>
            Upgrade from your server&rsquo;s Overview tab <ArrowRight size={15} />
          </Link>
          <p style={{ fontSize: 12, color: '#52535a', marginTop: 12 }}>Cancel anytime · Stripe customer portal · settings always kept</p>
        </div>
      </Section>

      {/* Perk columns */}
      <Section style={{ paddingTop: 80 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em' }}>What Premium unlocks</h2>
        <p style={{ fontSize: 14, color: '#6d6f78', textAlign: 'center', marginBottom: 32, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          Your color and footer apply to welcome, verify and info embeds — moderation embeds keep
          their warning colors on purpose, so alerts stay unmistakable.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {PERK_GROUPS.map((g) => (
            <div key={g.title} className="card-hover" style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(88,101,242,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <g.icon size={17} color="#96a4ff" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#f2f3f5' }}>{g.title}</div>
              </div>
              <p style={{ fontSize: 12.5, color: '#52535a', marginBottom: 14 }}>{g.tagline}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.items.map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <div style={{ width: 17, height: 17, borderRadius: '50%', background: 'rgba(35,165,90,0.12)', border: '1px solid rgba(35,165,90,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Check size={9} color="#23a55a" strokeWidth={3} />
                    </div>
                    <span style={{ fontSize: 13.5, color: '#949ba4', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
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
            <div key={f.q} className="card-hover" style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5', marginBottom: 6 }}>{f.q}</div>
              <p style={{ fontSize: 13.5, color: '#6d6f78', lineHeight: 1.55 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Closing CTA */}
      <Section style={{ paddingTop: 80, paddingBottom: 96, maxWidth: 720 }}>
        <div style={{ padding: '32px 24px', background: 'linear-gradient(180deg, rgba(88,101,242,0.08), transparent)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 16, textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', marginBottom: 8 }}>Ready when you are</h2>
          <p style={{ fontSize: 14, color: '#6d6f78', marginBottom: 20, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            Open your dashboard, pick a server, and upgrade from its Overview tab — it takes about a
            minute, and you can cancel just as fast.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/dashboard" className="btn-primary" style={{ fontSize: 14 }}>
              Open dashboard
            </Link>
            <Link href="/welcome" className="btn-secondary" style={{ fontSize: 14 }}>
              New here? Read the setup guide
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
