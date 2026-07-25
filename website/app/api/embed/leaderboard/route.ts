import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const RANK_COLORS: Record<number, string> = { 1: '#f0b232', 2: '#b5bac1', 3: '#cd7f32' };

// Monthly voter leaderboard as an embeddable SVG (same public data as the
// leaderboard on the site).
export async function GET(req: NextRequest) {
  const limit = Math.min(10, Math.max(3, parseInt(req.nextUrl.searchParams.get('limit') ?? '5', 10) || 5));

  let entries: { rank: number; username: string | null; votes: number }[] = [];
  let month = '';
  try {
    const d = await getLeaderboard(limit);
    month = d.month ?? '';
    entries = (d.leaderboard ?? []).slice(0, limit);
  } catch {
    // Bot API down — render an empty board instead of an error image.
  }

  const W = 300;
  const rowH = 26;
  const H = 58 + Math.max(entries.length, 1) * rowH + 14;
  const rows = entries.map((e, i) => {
    const y = 58 + i * rowH;
    const color = RANK_COLORS[e.rank] ?? '#76767f';
    const name = esc((e.username ?? 'Anonymous').slice(0, 20));
    return `<circle cx="28" cy="${y + 8}" r="9" fill="${color}22" stroke="${color}55"/>
  <text x="28" y="${y + 11.5}" font-family="${FONT}" font-size="9.5" font-weight="800" fill="${color}" text-anchor="middle">${e.rank}</text>
  <text x="46" y="${y + 12}" font-family="${FONT}" font-size="11.5" font-weight="600" fill="#ececee">${name}</text>
  <text x="${W - 18}" y="${y + 12}" font-family="${FONT}" font-size="11" font-weight="700" fill="#5b6cff" text-anchor="end">${e.votes.toLocaleString('en-US')} ♥</text>`;
  }).join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" role="img" aria-label="Link Protect voter leaderboard">
  <title>Link Protect — top voters ${esc(month)}</title>
  <rect width="${W}" height="${H}" rx="12" fill="#121214"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11.5" fill="none" stroke="#2e2e36"/>
  <text x="18" y="26" font-family="${FONT}" font-size="13" font-weight="700" fill="#f2f3f5">🏆 Top Voters</text>
  <text x="${W - 18}" y="26" font-family="${FONT}" font-size="10" fill="#949ba4" text-anchor="end">${esc(month)}</text>
  <line x1="16" y1="38" x2="${W - 16}" y2="38" stroke="#2e2e36"/>
  ${rows || `<text x="${W / 2}" y="72" font-family="${FONT}" font-size="11" fill="#76767f" text-anchor="middle">No votes yet this month</text>`}
  <text x="${W / 2}" y="${H - 8}" font-family="${FONT}" font-size="8.5" fill="#52535a" text-anchor="middle">vote on top.gg · link-protect.com</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400',
    },
  });
}
