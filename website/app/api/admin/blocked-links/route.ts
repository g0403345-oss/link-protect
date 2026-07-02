import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Forward the admin's query params (q / category / sort / limit) to the bot API.
  const qs = req.nextUrl.search;
  try {
    const res = await fetch(`${BOT_API_URL}/api/admin/blocked-links${qs}`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
