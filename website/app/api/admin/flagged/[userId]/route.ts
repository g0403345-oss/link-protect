import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdmin(session.user.id)) return null;
  return session.user.id;
}

/** Full inspection payload for one account (works for unflagged ids too). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { userId } = await params;
  if (!/^\d{5,25}$/.test(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/admin/flagged/${userId}/detail`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}`, 'X-Actor-Id': actor }, cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

/** Remove the network flag (false positive / accepted appeal equivalent). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { userId } = await params;
  try {
    const res = await fetch(`${BOT_API_URL}/api/admin/flagged/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${BOT_API_SECRET}`, 'X-Actor-Id': actor }, cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
