import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild } from '@/lib/discord';
import { getGuildStats } from '@/lib/db';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

async function verifyAccess(guildId: string, accessToken: string): Promise<boolean> {
  try {
    const guilds = await getUserGuilds(accessToken);
    const guild = guilds.find((g) => g.id === guildId);
    if (!guild) return false;
    return guild.owner || hasManageGuild(guild.permissions);
  } catch {
    return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    if (!isAdmin(session.user?.id)) {
      const hasAccess = await verifyAccess(id, session.accessToken);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    const stats = await getGuildStats(id);
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[API /guild/:id/stats]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
