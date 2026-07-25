import type { Metadata } from 'next';
import Link from 'next/link';
import { Code2, KeyRound, Webhook, Image as ImageIcon, ShieldCheck, Zap } from 'lucide-react';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Link Protect for Developers — API, Webhooks & Embeds',
  description:
    'Read-only REST API for your server’s protection stats, signed webhooks for moderation events, and live SVG embeds. Free for approved developers.',
  alternates: { canonical: '/developers' },
};

const C = {
  bg: '#111113', border: '#1e1e22', text: '#f2f3f5', muted: '#6d6f78',
  dim: '#52535a', accent: '#5865f2', code: '#949ba4',
};

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return <section id={id} style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px' }}>{children}</section>;
}

function H2({ icon: Icon, children }: { icon: typeof Code2; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '56px 0 10px' }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(88,101,242,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} color={C.accent} />
      </div>
      <h2 style={{ fontSize: 21, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{children}</h2>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', fontSize: 12.5, lineHeight: 1.6, color: C.code, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', margin: '10px 0' }}>
      {children}
    </pre>
  );
}

function Inline({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.92em', color: C.code, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '1px 6px' }}>{children}</code>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: '#949ba4', lineHeight: 1.7, margin: '8px 0' }}>{children}</p>;
}

const EVENTS = [
  ['link_blocked', 'A link was blocked and the member warned'],
  ['member_kicked', 'Warn threshold escalated to a kick'],
  ['member_banned', 'Warn threshold escalated to a ban'],
  ['member_timeout', 'Warn threshold escalated to a timeout'],
  ['scamshield_catch', 'Scam Shield caught cross-channel scam spam'],
  ['raid_detected', 'A link raid was auto-defended'],
];

export default function DevelopersPage() {
  return (
    <div style={{ minHeight: '100vh', paddingTop: 60, paddingBottom: 96, position: 'relative' }}>
      <div aria-hidden className="dot-grid" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      <Navbar />

      <Section>
        <div style={{ paddingTop: 64, textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 22 }}>
            <Code2 size={12} /> Developer Platform
          </div>
          <h1 style={{ fontSize: 'clamp(30px, 5.5vw, 44px)', fontWeight: 900, letterSpacing: '-0.04em', color: C.text, marginBottom: 14, lineHeight: 1.08 }}>
            Build with Link Protect
          </h1>
          <p style={{ fontSize: 15.5, color: C.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.65 }}>
            A read-only REST API for your server&rsquo;s protection data, signed webhooks for moderation
            events, and live SVG embeds — free for approved developers.
          </p>
        </div>
      </Section>

      <Section id="access">
        <H2 icon={ShieldCheck}>Getting access</H2>
        <P>
          Developer access is granted per Discord account. Sign in, open{' '}
          <Link href="/settings" style={{ color: C.accent }}>Settings → Developer Access</Link> and send a request —
          you&rsquo;ll get a notification once it&rsquo;s reviewed. Approved developers see a{' '}
          <b style={{ color: C.text }}>Developer</b> tab in every server dashboard they manage, where API keys and
          webhooks are created.
        </P>
      </Section>

      <Section id="auth">
        <H2 icon={KeyRound}>Authentication</H2>
        <P>
          API keys are created per server in that server&rsquo;s Developer tab (up to 5 per server) and grant
          read-only access to <b style={{ color: C.text }}>that server&rsquo;s</b> data. Send the key in the{' '}
          <Inline>X-Api-Key</Inline> header (or <Inline>Authorization: Bearer lp_…</Inline>).
          Keys are shown once at creation and stored only as a hash — treat them like passwords.
        </P>
        <P>Base URL: <Inline>https://link-protect.com/api/v1</Inline> · Rate limit: <b style={{ color: C.text }}>60 requests/minute per key</b> (HTTP 429 beyond that).</P>
      </Section>

      <Section id="rest">
        <H2 icon={Zap}>REST API</H2>

        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '20px 0 4px' }}>GET /api/v1/stats</h3>
        <P>Live protection stats for the key&rsquo;s server.</P>
        <Code>{`curl -H "X-Api-Key: lp_your_key" https://link-protect.com/api/v1/stats

{
  "guildId": "1234567890",
  "totalWarnings": 128,
  "warnedUsers": 42,
  "activeBlockers": 6,
  "blockers": { "malware": true, "nitro": true, "invite": false, ... },
  "thresholds": { "kick": 5, "ban": 10, "timeout": 3 }
}`}</Code>

        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '20px 0 4px' }}>GET /api/v1/trends?days=14</h3>
        <P>Daily action counts (1–60 days) plus totals and top reasons — the same data behind the dashboard chart.</P>
        <Code>{`curl -H "X-Api-Key: lp_your_key" "https://link-protect.com/api/v1/trends?days=7"

{
  "days": 7,
  "total": 23,
  "perDay": [ { "date": "2026-07-17", "warned": 3, "kicked": 0, "banned": 0, "timeout": 1, "count": 4 }, ... ],
  "topReasons": [ { "reason": "Posted a malware link", "count": 9 }, ... ],
  "totals": { "warned": 18, "kicked": 2, "banned": 1, "timeout": 2 }
}`}</Code>

        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '20px 0 4px' }}>GET /api/v1/check?url=…&amp;deep=1</h3>
        <P>
          Threat lookup against the Link Protect database + Google Safe Browsing — the engine behind the{' '}
          <Link href="/check" style={{ color: C.accent }}>public link checker</Link>. With{' '}
          <Inline>deep=1</Inline> the redirect chain is resolved server-side and every hop is checked.
        </P>
        <Code>{`curl -H "X-Api-Key: lp_your_key" "https://link-protect.com/api/v1/check?url=bit.ly/abc123&deep=1"

{
  "url": "bit.ly/abc123",
  "domain": "bit.ly",
  "safe": false,
  "category": "phishing",
  "source": "threat-db",
  "reason": "This link redirects to fake-login.ru, which is flagged as phishing…",
  "seenOnServers": 14,
  "redirects": [ { "url": "https://fake-login.ru/discord", "domain": "fake-login.ru", "status": 301 } ],
  "finalDomain": "fake-login.ru"
}`}</Code>
      </Section>

      <Section id="webhooks">
        <H2 icon={Webhook}>Webhooks</H2>
        <P>
          Register up to 3 HTTPS endpoints per server in the Developer tab and pick the events you care
          about. Deliveries are POSTs with a JSON body, sent within ~10 seconds of the event:
        </P>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', margin: '10px 0' }}>
          {EVENTS.map(([ev, desc], i) => (
            <div key={ev} style={{ display: 'flex', gap: 14, padding: '9px 16px', borderTop: i ? `1px solid ${C.border}` : 'none', fontSize: 12.5 }}>
              <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#96a4ff', width: 150, flexShrink: 0 }}>{ev}</code>
              <span style={{ color: C.muted }}>{desc}</span>
            </div>
          ))}
        </div>
        <Code>{`POST https://your-server.com/linkprotect-hook
Content-Type: application/json
X-LinkProtect-Event: link_blocked
X-LinkProtect-Signature: sha256=8f3a…

{
  "event": "link_blocked",
  "guildId": "1234567890",
  "data": {
    "user_id": "9876543210", "username": "scammer42", "channel_id": "111222333",
    "action": "warned", "reason": "Posted a malware link", "warn_count": 2,
    "timestamp": 1784800000
  },
  "sentAt": 1784800005
}`}</Code>
        <P>
          Every delivery is signed: <Inline>X-LinkProtect-Signature</Inline> is the hex HMAC-SHA256 of the raw
          request body, keyed with your webhook&rsquo;s <Inline>whsec_…</Inline> secret. Verify before trusting:
        </P>
        <Code>{`// Node.js
import crypto from "node:crypto";

function verify(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}`}</Code>
        <P>
          Respond with any 2xx within 6 seconds. Failed deliveries count up — after 25 consecutive
          failures the webhook is disabled automatically (re-enable it in the Developer tab, which also
          resets the counter). Use the <b style={{ color: C.text }}>Test</b> button to send a sample event any time.
        </P>
      </Section>

      <Section id="embeds">
        <H2 icon={ImageIcon}>Embeds</H2>
        <P>Live SVG widgets — no key required, cacheable, safe to hotlink:</P>
        <Code>{`<!-- Protected-by badge (style=light for bright pages) -->
<img src="https://link-protect.com/api/badge?guild=YOUR_SERVER_ID" alt="Protected by Link Protect">

<!-- Live stats card -->
<img src="https://link-protect.com/api/embed/stats?guild=YOUR_SERVER_ID" alt="Link Protect stats">

<!-- Voter leaderboard (limit 3–10) -->
<img src="https://link-protect.com/api/embed/leaderboard?limit=5" alt="Top voters">`}</Code>
      </Section>

      <Section>
        <div style={{ marginTop: 56, padding: '28px 24px', background: 'linear-gradient(180deg, rgba(88,101,242,0.08), transparent)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 16, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>Missing something?</h2>
          <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 18, lineHeight: 1.6 }}>
            The platform grows with what developers actually need — send a feature request from any
            server dashboard (Report → Feedback) or join the beta programme in the Developer tab.
          </p>
          <Link href="/settings" className="btn-primary" style={{ fontSize: 14 }}>
            Request developer access
          </Link>
        </div>
      </Section>
    </div>
  );
}
