import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  if (!/^\d{5,25}$/.test(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/watchlist/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        ...(access.userId ? { 'X-Actor-Id': access.userId } : {}),
      },
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
