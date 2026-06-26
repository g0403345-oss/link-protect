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
  if (!access.ok) {
    return NextResponse.json({ error: access.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: access.status });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/warns/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ error: 'Bot API error' }, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
