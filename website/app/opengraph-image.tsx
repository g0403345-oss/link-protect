import { ImageResponse } from 'next/og';

// Default Open-Graph card — shown whenever a link-protect.com URL is shared
// in Discord, Twitter, iMessage, … (pages with their own og:image override it).
export const runtime = 'edge';
export const alt = 'Link Protect — Protect Your Discord Server';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', padding: 72, fontFamily: 'sans-serif', position: 'relative' }}>
        {/* brand glows — same treatment as the site background */}
        <div style={{ position: 'absolute', top: -220, left: -140, width: 720, height: 720, borderRadius: 9999, background: '#5865f2', opacity: 0.22, filter: 'blur(130px)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -260, right: -160, width: 640, height: 640, borderRadius: 9999, background: '#8b7ff0', opacity: 0.16, filter: 'blur(130px)', display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 16, background: 'rgba(88,101,242,0.18)', border: '1px solid rgba(88,101,242,0.4)', fontSize: 34 }}>🛡️</div>
          <span style={{ fontSize: 38, fontWeight: 700, color: '#f2f3f5' }}>Link Protect</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', fontSize: 82, fontWeight: 800, color: '#f2f3f5', letterSpacing: -3, lineHeight: 1.05 }}>
            Protect your
          </div>
          <div style={{ display: 'flex', fontSize: 82, fontWeight: 800, color: '#5865f2', letterSpacing: -3, lineHeight: 1.05 }}>
            Discord server.
          </div>
          <div style={{ display: 'flex', marginTop: 26, fontSize: 30, color: '#949ba4', maxWidth: 820, lineHeight: 1.45 }}>
            Blocks scam links, stops raids and spam blitzes — automatically, in seconds.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 24, color: '#6d6f78' }}>
          <span style={{ color: '#23a55a', display: 'flex', alignItems: 'center', gap: 8 }}>● Free forever</span>
          <span>link-protect.com</span>
        </div>
      </div>
    ),
    size
  );
}
