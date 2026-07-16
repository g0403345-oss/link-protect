import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const users = req.nextUrl.searchParams.get('users') ?? '';
  try {
    const res = await fetch(`${BOT_API_URL}/api/admin/flag-evidence?users=${encodeURIComponent(users)}`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}`, 'X-Actor-Id': session.user.id }, cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
