import type { Metadata } from 'next';
import Link from 'next/link';
import { Code2, KeyRound, Webhook, Image as ImageIcon, ShieldCheck, Zap, Radio, Terminal, Package, FlaskConical, Download } from 'lucide-react';
import Navbar from '@/components/Navbar';
import ApiPlayground from '@/components/ApiPlayground';

export const metadata: Metadata = {
  title: 'Link Protect for Developers — API, Webhooks & SDKs',
  description:
    'Scoped REST API for stats, link checks, moderation and config, a realtime event stream, signed webhooks, SDKs and live SVG embeds. Free for approved developers.',
  alternates: { canonical: '/developers' },
};

const C = {
  bg: '#111113', border: '#1e1e22', text: '#f2f3f5', muted: '#6d6f78',
  dim: '#52535a', accent: '#5865f2', code: '#949ba4',
};

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return <section id={id} style={{ scrollMarginTop: 84 }}>{children}</section>;
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

function Endpoint({ method, path, scope }: { method: 'GET' | 'POST'; path: string; scope?: 'moderate' | 'config' }) {
  return (
    <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 15, fontWeight: 700, color: C.text, margin: '24px 0 4px' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: method === 'GET' ? '#23a55a' : '#f0b232', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 99, padding: '1px 8px' }}>{method}</span>
      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14 }}>{path}</span>
      {scope && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: scope === 'moderate' ? '#f0b232' : '#23a55a', background: scope === 'moderate' ? 'rgba(240,178,50,0.1)' : 'rgba(35,165,90,0.1)', borderRadius: 99, padding: '1px 8px' }}>
          scope: {scope}
        </span>
      )}
    </h3>
  );
}

const SCOPES: [string, string, string][] = [
  ['read', '#949ba4', 'Stats, trends, link checks, warn lookups, the event stream. Always granted.'],
  ['moderate', '#f0b232', 'Warn, timeout, kick & ban members via POST /moderate.'],
  ['config', '#23a55a', 'Toggle blockers, edit the blacklist, switch lockdown on or off.'],
];

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

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 32px 0' }}>
        <div className="split-hero">
          <div>
            <div className="eyebrow" style={{ marginBottom: 20 }}>
              <Code2 size={12} /> Developer Platform
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 4.4vw, 50px)', fontWeight: 900, letterSpacing: '-0.04em', color: C.text, marginBottom: 14, lineHeight: 1.05 }}>
              Build with Link Protect
            </h1>
            <p style={{ fontSize: 15.5, color: C.muted, maxWidth: 500, lineHeight: 1.65 }}>
              A scoped REST API for stats, link checks, moderation and config, a realtime event stream,
              signed webhooks, ready-made SDKs and live SVG embeds — free for approved developers.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '18px 20px', background: 'rgba(35,165,90,0.07)', border: '1px solid rgba(35,165,90,0.3)', borderRadius: 14 }}>
            <FlaskConical size={16} color="#23a55a" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, marginBottom: 3 }}>
                Try everything without a server — sandbox key <Inline>lp_sandbox</Inline>
              </div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                The public sandbox key works for anyone on every read endpoint and returns synthetic data —
                no sign-up, no Discord server, no approval. It&rsquo;s prefilled in the{' '}
                <a href="#playground" style={{ color: C.accent }}>Playground</a>. Write endpoints
                (<Inline>moderate</Inline>, <Inline>config</Inline> scope) need a real key from your server&rsquo;s Developer tab.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 32px 0' }}>
        <div className="docs-layout">
          <nav className="docs-nav" aria-label="On this page">
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#52535a', padding: '0 10px 8px' }}>On this page</div>
            <a href="#access">Getting access</a>
            <a href="#auth">Authentication</a>
            <a href="#rest">REST API</a>
            <a href="#stream">Event stream</a>
            <a href="#playground">Playground</a>
            <a href="#sdks">SDKs</a>
            <a href="#webhooks">Webhooks</a>
            <a href="#embeds">Embeds</a>
          </nav>
          <div style={{ minWidth: 0 }}>

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
          API keys are created per server in that server&rsquo;s Developer tab (up to 5 per server) and only
          reach <b style={{ color: C.text }}>that server&rsquo;s</b> data. Send the key in the{' '}
          <Inline>X-Api-Key</Inline> header (or <Inline>Authorization: Bearer lp_…</Inline>).
          Keys are shown once at creation and stored only as a hash — treat them like passwords.
        </P>
        <P>Base URL: <Inline>https://link-protect.com/api/v1</Inline> · Rate limit: <b style={{ color: C.text }}>60 requests/minute per key</b> (HTTP 429 beyond that).</P>
        <P>
          Each key carries <b style={{ color: C.text }}>scopes</b>, chosen when the key is created.
          Calling an endpoint without the required scope returns HTTP 403:
        </P>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', margin: '10px 0' }}>
          {SCOPES.map(([scope, color, desc], i) => (
            <div key={scope} style={{ display: 'flex', gap: 14, padding: '9px 16px', borderTop: i ? `1px solid ${C.border}` : 'none', fontSize: 12.5 }}>
              <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', color, width: 90, flexShrink: 0, fontWeight: 700 }}>{scope}</code>
              <span style={{ color: C.muted }}>{desc}</span>
            </div>
          ))}
        </div>
        <P>
          The sandbox key <Inline>lp_sandbox</Inline> has the <Inline>read</Inline> scope only and serves
          synthetic data — perfect for trying requests before creating a real key.
        </P>
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

        <Endpoint method="POST" path="/api/v1/check/batch" />
        <P>Check up to <b style={{ color: C.text }}>25 URLs</b> in one request — same verdict shape as the single check, one entry per URL.</P>
        <Code>{`curl -X POST -H "X-Api-Key: lp_sandbox" -H "Content-Type: application/json" \\
  -d '{"urls": ["bit.ly/abc123", "https://example.com"]}' \\
  https://link-protect.com/api/v1/check/batch`}</Code>

        <Endpoint method="GET" path="/api/v1/warns/{userId}" />
        <P>The warning record of one member on the key&rsquo;s server — count, reasons and where they stand against the kick/ban thresholds.</P>
        <Code>{`curl -H "X-Api-Key: lp_sandbox" https://link-protect.com/api/v1/warns/9876543210`}</Code>

        <Endpoint method="POST" path="/api/v1/moderate" scope="moderate" />
        <P>
          Moderate a member from your own tooling. <Inline>action</Inline> is one of{' '}
          <Inline>warn</Inline> · <Inline>timeout</Inline> · <Inline>untimeout</Inline> · <Inline>kick</Inline> · <Inline>ban</Inline> · <Inline>unban</Inline>;{' '}
          <Inline>minutes</Inline> sets the timeout length, <Inline>reason</Inline> lands in the audit log.
        </P>
        <Code>{`curl -X POST -H "X-Api-Key: lp_your_key" -H "Content-Type: application/json" \\
  -d '{"userId": "9876543210", "action": "timeout", "minutes": 60, "reason": "Spam"}' \\
  https://link-protect.com/api/v1/moderate`}</Code>

        <Endpoint method="POST" path="/api/v1/blocker" scope="config" />
        <P>Toggle one of the link blockers (<Inline>malware</Inline>, <Inline>nitro</Inline>, <Inline>invite</Inline>, … — the same ids the stats endpoint returns).</P>
        <Code>{`curl -X POST -H "X-Api-Key: lp_your_key" -H "Content-Type: application/json" \\
  -d '{"blocker": "nitro", "enabled": true}' \\
  https://link-protect.com/api/v1/blocker`}</Code>

        <Endpoint method="POST" path="/api/v1/blacklist" scope="config" />
        <P>Add or remove a domain/link on the server&rsquo;s custom blacklist — <Inline>action</Inline> is <Inline>add</Inline> or <Inline>remove</Inline>.</P>
        <Code>{`curl -X POST -H "X-Api-Key: lp_your_key" -H "Content-Type: application/json" \\
  -d '{"action": "add", "link": "scam-site.ru"}' \\
  https://link-protect.com/api/v1/blacklist`}</Code>

        <Endpoint method="POST" path="/api/v1/lockdown" scope="config" />
        <P>Switch emergency lockdown on or off — the same big red button as the dashboard, scriptable.</P>
        <Code>{`curl -X POST -H "X-Api-Key: lp_your_key" -H "Content-Type: application/json" \\
  -d '{"active": true, "reason": "Raid in progress"}' \\
  https://link-protect.com/api/v1/lockdown`}</Code>

        <Endpoint method="GET" path="/api/v1/openapi.json" />
        <P>
          The full <b style={{ color: C.text }}>OpenAPI 3</b> spec of the public API — no key required.
          Feed it to your client generator or import it into Postman/Insomnia:{' '}
          <a href="/api/v1/openapi.json" style={{ color: C.accent }}>link-protect.com/api/v1/openapi.json</a>.
        </P>
      </Section>

      <Section id="stream">
        <H2 icon={Radio}>Realtime event stream</H2>
        <P>
          <Inline>GET /api/v1/events/stream</Inline> is a <b style={{ color: C.text }}>Server-Sent Events</b> stream
          of your server&rsquo;s moderation events (the same six event types webhooks deliver) — ideal when you
          can&rsquo;t host a public webhook endpoint. Auth works via the usual <Inline>X-Api-Key</Inline> header,
          or a <Inline>?key=</Inline> query param for browser <Inline>EventSource</Inline> clients:
        </P>
        <Code>{`const es = new EventSource(
  "https://link-protect.com/api/v1/events/stream?key=lp_your_key"
);
es.onmessage = (e) => {
  const event = JSON.parse(e.data);   // { event: "link_blocked", guildId, data, … }
  console.log(event.event, event.data);
};`}</Code>
        <P>
          Limits: <b style={{ color: C.text }}>2 concurrent streams per key</b>, and each connection is closed
          after 30 minutes — <Inline>EventSource</Inline> reconnects automatically.
        </P>
      </Section>

      <Section id="playground">
        <H2 icon={Terminal}>Playground</H2>
        <P>
          Fire real requests from your browser — prefilled with the sandbox key <Inline>lp_sandbox</Inline>,
          so everything read-only works instantly. Paste your own key to hit your server (moderate/config
          calls are <b style={{ color: C.text }}>live</b> — they really moderate).
        </P>
        <ApiPlayground />
      </Section>

      <Section id="sdks">
        <H2 icon={Package}>SDKs</H2>
        <P>
          Tiny zero-dependency clients for the whole v1 API — REST calls, the event stream and a{' '}
          <b style={{ color: C.text }}>webhook signature verification</b> helper are included in both.
        </P>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '14px 0' }}>
          {[
            {
              name: 'JavaScript SDK', file: '/sdk/linkprotect-js.zip', note: 'Node 18+ & browsers · ESM',
              snippet: `import { LinkProtect } from "./linkprotect.js";

const lp = new LinkProtect("lp_your_key");

const stats = await lp.stats();
const verdict = await lp.check("bit.ly/abc123");
await lp.moderate({ userId: "9876543210", action: "warn" });

// Express: verify webhook deliveries
lp.verifySignature(rawBody, req.headers["x-linkprotect-signature"], "whsec_…");`,
            },
            {
              name: 'Python SDK', file: '/sdk/linkprotect-python.zip', note: 'Python 3.9+ · stdlib only',
              snippet: `from linkprotect import LinkProtect

lp = LinkProtect("lp_your_key")

stats = lp.stats()
verdict = lp.check("bit.ly/abc123")
lp.moderate(user_id="9876543210", action="warn")

# Flask/FastAPI: verify webhook deliveries
lp.verify_signature(raw_body, signature_header, "whsec_…")`,
            },
          ].map((sdk) => (
            <div key={sdk.name} style={{ flex: '1 1 340px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, flex: 1 }}>{sdk.name}</div>
                <a href={sdk.file} download
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: 12, fontWeight: 700, background: C.accent, color: '#fff', borderRadius: 8, textDecoration: 'none' }}>
                  <Download size={12} /> Download
                </a>
              </div>
              <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 10 }}>{sdk.note}</div>
              <pre style={{ background: '#0c0c0e', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', fontSize: 11.5, lineHeight: 1.6, color: C.code, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {sdk.snippet}
              </pre>
            </div>
          ))}
        </div>
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
          resets the counter). The Developer tab keeps a <b style={{ color: C.text }}>delivery log</b> (last 50,
          with status and latency) per webhook, and its <b style={{ color: C.text }}>Send test event</b> control
          delivers a realistic sample of any event type to your endpoint on demand.
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
        </div>
      </section>
    </div>
  );
}
