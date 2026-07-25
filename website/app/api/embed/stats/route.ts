import { NextRequest, NextResponse } from 'next/server';
import { getGuildStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';
const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';
const SHIELD =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Live server stats card — embeddable SVG for websites/READMEs. Aggregate
// numbers only (same data the badge exposes), no member data.
export async function GET(req: NextRequest) {
  const guild = (req.nextUrl.searchParams.get('guild') ?? '').trim();
  if (!/^\d{5,25}$/.test(guild)) {
    return NextResponse.json({ error: 'Pass a server id: /api/embed/stats?guild=<id>' }, { status: 400 });
  }

  let name = 'Discord server';
  let warnings = 0, warned = 0, week = 0;
  try {
    const [stats, infoRes, trendsRes] = await Promise.all([
      getGuildStats(guild),
      fetch(`${BOT_API_URL}/api/guild/${guild}/discord-info`, {
        headers: { Authorization: `Bearer ${BOT_API_SECRET}` }, cache: 'no-store',
      }),
      fetch(`${BOT_API_URL}/api/guild/${guild}/trends?days=7`, {
        headers: { Authorization: `Bearer ${BOT_API_SECRET}` }, cache: 'no-store',
      }),
    ]);
    warnings = stats.totalWarnings ?? 0;
    warned = stats.warnedUsers ?? 0;
    if (infoRes.ok) {
      const info = await infoRes.json();
      if (info?.name) name = String(info.name).slice(0, 28);
    }
    if (trendsRes.ok) {
      const t = await trendsRes.json();
      week = t?.total ?? 0;
    }
  } catch {
    // Bot API down — render the card with zeros rather than failing the page.
  }

  const W = 360, H = 130;
  const cols = [
    { label: 'THREATS STOPPED', value: warnings, color: '#f0b232' },
    { label: 'LAST 7 DAYS', value: week, color: '#5865f2' },
    { label: 'USERS WARNED', value: warned, color: '#23a55a' },
  ];
  const colW = (W - 36) / 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" role="img" aria-label="Link Protect stats for ${esc(name)}">
  <title>Link Protect — live protection stats for ${esc(name)}</title>
  <rect width="${W}" height="${H}" rx="12" fill="#121214"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11.5" fill="none" stroke="#2e2e36"/>
  <g transform="translate(16,14) scale(0.7)">
    <path d="${SHIELD}" fill="none" stroke="#5865f2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="42" y="27" font-family="${FONT}" font-size="13" font-weight="700" fill="#f2f3f5">Link Protect</text>
  <text x="${W - 16}" y="27" font-family="${FONT}" font-size="11" fill="#949ba4" text-anchor="end">${esc(name)}</text>
  <line x1="16" y1="40" x2="${W - 16}" y2="40" stroke="#2e2e36"/>
  ${cols.map((c, i) => {
    const cx = 18 + colW * i + colW / 2;
    return `<text x="${cx}" y="78" font-family="${FONT}" font-size="24" font-weight="800" fill="${c.color}" text-anchor="middle">${c.value.toLocaleString('en-US')}</text>
  <text x="${cx}" y="96" font-family="${FONT}" font-size="8.5" font-weight="700" fill="#76767f" text-anchor="middle" letter-spacing="0.5">${c.label}</text>`;
  }).join('\n  ')}
  <text x="${W / 2}" y="${H - 12}" font-family="${FONT}" font-size="9" fill="#52535a" text-anchor="middle">live · link-protect.com</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400',
    },
  });
}
