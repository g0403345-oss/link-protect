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

const FREE_CHIPS = [
  'All 16 link blockers', 'Warnings, kicks & bans', 'Scam Shield', 'Raid protection',
  'Verification gate', 'Emergency lockdown', 'Web dashboard', 'iOS app', 'Message Studio basics',
];

const HIGHLIGHTS = [
  'Your color, footer & welcome messages',
  'White-label verify page & vanity link',
  'Watchlist, night schedule & undo',
  'Sync to 25 servers · 10× API limits',
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

function Shell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px', ...style }}>{children}</section>;
}

export default function PremiumPage() {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 60, position: 'relative' }}>
      <div aria-hidden className="dot-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      <Navbar />

      {/* ── Hero: pitch left, price right ── */}
      <Shell style={{ paddingTop: 72 }}>
        <div className="split-hero">
          <div>
            <div className="eyebrow" style={{ marginBottom: 20 }}>
              <Gem size={12} /> Link Protect Premium
            </div>
            <h1 style={{ fontSize: 'clamp(34px, 4.6vw, 54px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', marginBottom: 16, lineHeight: 1.04 }}>
              Everything free, forever.<br />Premium adds polish.
            </h1>
            <p style={{ fontSize: 16, color: '#949ba4', maxWidth: 480, lineHeight: 1.65, marginBottom: 28 }}>
              Protection is not a paid feature. Premium is for teams that want the bot to look, feel
              and scale like their own — colors, branding, comfort tools and API headroom.
            </p>

            {/* Pledge as an editorial note, not another floating card */}
            <div style={{ borderLeft: '2px solid #23a55a', padding: '2px 0 2px 16px', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <ShieldCheck size={14} color="#23a55a" />
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#f2f3f5' }}>Our free-forever pledge</span>
              </div>
              <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.6, maxWidth: 460 }}>
                No protection feature will ever move behind a paywall — for every server, forever.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 520 }}>
              {FREE_CHIPS.map((c) => (
                <span key={c} style={{ fontSize: 11.5, fontWeight: 600, color: '#6d6f78', border: '1px solid #1e1e22', background: 'rgba(17,17,19,0.6)', borderRadius: 99, padding: '4px 11px', whiteSpace: 'nowrap' }}>
                  {c} · free
                </span>
              ))}
            </div>
          </div>

          {/* Price card */}
          <div style={{ position: 'relative', background: '#111113', border: '1px solid rgba(88,101,242,0.35)', borderRadius: 16, padding: '26px 26px 22px', boxShadow: '0 24px 80px rgba(88,101,242,0.10)' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'linear-gradient(160deg, rgba(88,101,242,0.10), transparent 45%)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#96a4ff', marginBottom: 14 }}>Per server</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2 }}>
              <span style={{ fontSize: 46, fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.04em' }}>3,49&nbsp;€</span>
              <span style={{ fontSize: 15, color: '#6d6f78', fontWeight: 600 }}>/month</span>
            </div>
            <div style={{ fontSize: 13.5, color: '#949ba4', marginBottom: 18 }}>
              or <strong style={{ color: '#f2f3f5' }}>29&nbsp;€/year</strong> (save ~31%) · billed via Stripe
            </div>
            <div style={{ borderTop: '1px solid #1e1e22', paddingTop: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {HIGHLIGHTS.map((h) => (
                <div key={h} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <Check size={13} color="#23a55a" strokeWidth={3} style={{ flexShrink: 0, marginTop: 3 }} />
                  <span style={{ fontSize: 13, color: '#b5bac1', lineHeight: 1.5 }}>{h}</span>
                </div>
              ))}
            </div>
            <Link href="/dashboard"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 24px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', borderRadius: 10, textDecoration: 'none' }}>
              Upgrade from your server&rsquo;s Overview tab <ArrowRight size={15} />
            </Link>
            <p style={{ fontSize: 11.5, color: '#52535a', marginTop: 11, textAlign: 'center' }}>Cancel anytime · Stripe customer portal · settings always kept</p>
          </div>
        </div>
      </Shell>

      {/* ── Perks: three open columns divided by hairlines ── */}
      <Shell style={{ paddingTop: 96 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', borderBottom: '1px solid #1e1e22', paddingBottom: 16, marginBottom: 8 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em' }}>What Premium unlocks</h2>
          <p style={{ fontSize: 13, color: '#6d6f78', maxWidth: 480, lineHeight: 1.6 }}>
            Your color and footer apply to welcome, verify and info embeds — moderation embeds keep
            their warning colors on purpose.
          </p>
        </div>
        <div className="rail-3col">
          {PERK_GROUPS.map((g, gi) => (
            <div key={g.title} style={{ padding: gi === 0 ? '22px 28px 22px 0' : '22px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(88,101,242,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <g.icon size={16} color="#96a4ff" />
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#f2f3f5' }}>{g.title}</div>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#2e2e36' }}>0{gi + 1}</span>
              </div>
              <p style={{ fontSize: 12.5, color: '#52535a', marginBottom: 16 }}>{g.tagline}</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {g.items.map((item, ii) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: ii === 0 ? 'none' : '1px solid #17171a' }}>
                    <Check size={12} color="#23a55a" strokeWidth={3} style={{ flexShrink: 0, marginTop: 4 }} />
                    <span style={{ fontSize: 13.5, color: '#949ba4', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
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

      {/* ── Closing CTA: horizontal band ── */}
      <Shell style={{ paddingTop: 72, paddingBottom: 96 }}>
        <div className="cta-band" style={{ padding: '28px 32px', background: 'linear-gradient(120deg, rgba(88,101,242,0.10), rgba(88,101,242,0.02))', border: '1px solid rgba(88,101,242,0.22)', borderRadius: 16 }}>
          <div style={{ minWidth: 260 }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, color: '#f2f3f5', marginBottom: 6 }}>Ready when you are</h2>
            <p style={{ fontSize: 13.5, color: '#949ba4', lineHeight: 1.6, maxWidth: 520 }}>
              Open your dashboard, pick a server, upgrade from its Overview tab — about a minute,
              cancelled just as fast.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/dashboard" className="btn-primary" style={{ fontSize: 14 }}>
              Open dashboard
            </Link>
            <Link href="/welcome" className="btn-secondary" style={{ fontSize: 14 }}>
              New here? Setup guide
            </Link>
          </div>
        </div>
      </Shell>
    </div>
  );
}
