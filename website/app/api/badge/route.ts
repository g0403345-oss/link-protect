import { NextRequest, NextResponse } from 'next/server';
import { getStats, getGuildStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

// "Protected by Link Protect" badge — an embeddable SVG (shields.io style) for
// READMEs, server websites and forum signatures. Global by default; with
// ?guild=<id> it shows that server's own counter. Only aggregate numbers are
// exposed, never user data.

const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';
// Lucide "shield" outline, 24×24 viewBox.
const SHIELD =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z';

const textWidth = (s: string) => Math.ceil(s.length * 6.7);

function badgeSvg(right: string, style: 'dark' | 'light'): string {
  const left = 'Link Protect';
  const h = 28;
  const iconBox = 26;
  const leftW = iconBox + textWidth(left) + 12;
  const rightW = textWidth(right) + 18;
  const w = leftW + rightW;
  const leftBg = style === 'light' ? '#ffffff' : '#18181b';
  const leftText = style === 'light' ? '#18181b' : '#f2f3f5';
  const stroke = style === 'light' ? '<rect width="' + w + '" height="' + h + '" rx="5" fill="none" stroke="#d0d2d8"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${left}: ${right}">
  <title>Protected by ${left} — ${right}</title>
  <clipPath id="r"><rect width="${w}" height="${h}" rx="5"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftW}" height="${h}" fill="${leftBg}"/>
    <rect x="${leftW}" width="${rightW}" height="${h}" fill="#5865f2"/>
  </g>
  ${stroke}
  <g transform="translate(8,7) scale(0.58)">
    <path d="${SHIELD}" fill="none" stroke="#5865f2" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g fill="${leftText}" font-family="${FONT}" font-size="11" font-weight="700" text-anchor="middle">
    <text x="${iconBox + (leftW - iconBox) / 2 - 2}" y="18">${left}</text>
    <text x="${leftW + rightW / 2}" y="18" fill="#ffffff">${right}</text>
  </g>
</svg>`;
}

export async function GET(req: NextRequest) {
  const guild = (req.nextUrl.searchParams.get('guild') ?? '').trim();
  const style = req.nextUrl.searchParams.get('style') === 'light' ? 'light' as const : 'dark' as const;
  let right = 'protected';
  try {
    if (/^\d{5,25}$/.test(guild)) {
      const stats = await getGuildStats(guild);
      const n = stats.totalWarnings ?? 0;
      right = n > 0 ? `${n.toLocaleString('en-US')} threats stopped` : 'protected';
    } else {
      const stats = await getStats();
      const n = stats.servers ?? 0;
      right = n > 0 ? `${n.toLocaleString('en-US')} servers protected` : 'protected';
    }
  } catch {
    // Bot API unreachable — still serve a valid badge, just without the number.
  }
  return new NextResponse(badgeSvg(right, style), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
