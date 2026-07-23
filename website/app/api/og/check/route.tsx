import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Dynamic Open-Graph card for shared checker results (/check?url=…): when the
// link is posted in Discord/Twitter, the preview shows the actual verdict.
// The verdict is fetched through the public checker proxy (rate-limited, cached
// via CDN headers below) — no internal secret in this edge function.

const CAT_COLOR: Record<string, string> = {
  malware: '#f23f43', phishing: '#eb459e', scam: '#f0b232', nitro: '#eb459e',
};

export async function GET(req: NextRequest) {
  const url = (req.nextUrl.searchParams.get('url') ?? '').trim().slice(0, 300);

  let safe: boolean | null = null;
  let category: string | null = null;
  let domain = '';
  let seen = 0;
  if (url) {
    try {
      const origin = req.nextUrl.origin;
      const res = await fetch(`${origin}/api/check?url=${encodeURIComponent(url)}`, {
        headers: { 'user-agent': 'lp-og-renderer' },
      });
      if (res.ok) {
        const d = await res.json();
        safe = !!d.safe;
        category = d.category ?? null;
        domain = d.domain ?? '';
        seen = d.seenOnServers ?? 0;
      }
    } catch { /* render the neutral card */ }
  }

  const verdictColor = safe === null ? '#5865f2' : safe ? '#23a55a' : (CAT_COLOR[category ?? ''] ?? '#f23f43');
  const title = safe === null ? 'Is this link safe?' : safe ? 'No threat found' : `Dangerous link${category ? ` · ${category}` : ''}`;
  const icon = safe === null ? '🛡️' : safe ? '✅' : '⚠️';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', padding: 64, fontFamily: 'sans-serif', position: 'relative' }}>
        {/* accent glow */}
        <div style={{ position: 'absolute', top: -180, left: -120, width: 640, height: 640, borderRadius: 9999, background: verdictColor, opacity: 0.16, filter: 'blur(120px)', display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 14, background: 'rgba(88,101,242,0.16)', fontSize: 30 }}>🛡️</div>
          <span style={{ fontSize: 34, fontWeight: 700, color: '#f2f3f5' }}>Link Protect</span>
          <span style={{ fontSize: 24, color: '#52535a', marginLeft: 8 }}>· free URL checker</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <span style={{ fontSize: 84 }}>{icon}</span>
            <span style={{ fontSize: 76, fontWeight: 800, color: verdictColor, letterSpacing: -2 }}>{title}</span>
          </div>
          {domain && (
            <div style={{ display: 'flex', marginTop: 18, fontSize: 40, color: '#949ba4', fontFamily: 'monospace' }}>
              {domain.slice(0, 42)}
            </div>
          )}
          {seen > 0 && (
            <div style={{ display: 'flex', marginTop: 14, fontSize: 28, color: '#f0b232' }}>
              Seen on {seen.toLocaleString('en-US')} Discord servers
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 26, color: '#6d6f78' }}>Check any link free at link-protect.com/check</span>
          <span style={{ fontSize: 26, color: verdictColor, fontWeight: 700 }}>{safe === null ? '' : safe ? 'SAFE' : 'BLOCKED ACROSS 6,000+ SERVERS'}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
