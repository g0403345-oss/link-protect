import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Public: serve a server's custom verify-page logo with long CDN caching
// (the page busts the cache via ?v=<version>).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ error: 'Invalid server' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${guildId}/verify/logo`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      cache: 'no-store',
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
