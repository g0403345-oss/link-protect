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
    if (guild && (guild.owner || hasManageGuild(guild.permissions))) return true;
    // Delegated dashboard editor: resolve this user's id, check the guild's team list.
    const meRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    });
    if (!meRes.ok) return false;
    const userId = (await meRes.json()).id as string;
    const res = await fetch(
      `${process.env.BOT_API_URL ?? 'http://localhost:3001'}/api/guild/${guildId}/editors`,
      { headers: { Authorization: `Bearer ${process.env.BOT_API_SECRET ?? 'change-me-in-production'}` }, cache: 'no-store' },
    );
    if (!res.ok) return false;
    const d = await res.json();
    return (d.editors ?? []).some((e: { id: string }) => e.id === userId);
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
