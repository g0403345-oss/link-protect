import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild } from '@/lib/discord';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, userId } = await params;

  if (!isAdmin(session.user?.id)) {
    try {
      const guilds = await getUserGuilds(session.accessToken);
      const guild = guilds.find(g => g.id === id);
      if (!guild || (!guild.owner && !hasManageGuild(guild.permissions))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Failed to verify access' }, { status: 502 });
    }
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
