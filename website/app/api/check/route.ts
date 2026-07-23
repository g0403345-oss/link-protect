import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Naive per-IP rate limit (per server instance). The bot also caches verdicts in
// `scanned_urls`, so this is just abuse protection for the public checker.
const buckets = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = buckets.get(ip);
  if (!e || now > e.reset) {
    buckets.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  e.n += 1;
  return e.n > 20;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many checks — slow down a moment.' }, { status: 429 });
  }
  const url = (req.nextUrl.searchParams.get('url') ?? '').trim();
  if (!url) {
    return NextResponse.json({ error: 'Provide a link to check.' }, { status: 400 });
  }
  // deep=1 (checker page only) also resolves the redirect chain server-side —
  // slower, so the compact home-page checker doesn't request it.
  const deep = req.nextUrl.searchParams.get('deep') === '1' ? '&deep=1' : '';
  try {
    const res = await fetch(`${BOT_API_URL}/api/check?url=${encodeURIComponent(url)}${deep}`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'The checker is temporarily unavailable.' }, { status: 503 });
  }
}
