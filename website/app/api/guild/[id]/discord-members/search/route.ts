import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild } from '@/lib/discord';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

async function verifyAccess(guildId: string, accessToken: string): Promise<boolean> {
  try {
    const guilds = await getUserGuilds(accessToken);
    const guild = guilds.find((g) => g.id === guildId);
    if (!guild) return false;
    return guild.owner || hasManageGuild(guild.permissions);
  } catch { return false; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!isAdmin(session.user?.id)) {
    const hasAccess = await verifyAccess(id, session.accessToken);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const res = await fetch(`${BOT_API_URL}/api/guild/${id}/discord-members/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data);
}
