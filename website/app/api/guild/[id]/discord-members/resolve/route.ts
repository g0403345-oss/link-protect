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
    if (guild && (guild.owner || hasManageGuild(guild.permissions))) return true;
    const meRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    });
    if (!meRes.ok) return false;
    const userId = (await meRes.json()).id as string;
    const res = await fetch(`${BOT_API_URL}/api/guild/${guildId}/editors`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` }, cache: 'no-store',
    });
    if (!res.ok) return false;
    const d = await res.json();
    return (d.editors ?? []).some((e: { id: string }) => e.id === userId);
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
  const ids = req.nextUrl.searchParams.get('ids') ?? '';
  const res = await fetch(
    `${BOT_API_URL}/api/guild/${id}/discord-members/resolve?ids=${encodeURIComponent(ids)}`,
    { headers: { Authorization: `Bearer ${BOT_API_SECRET}` }, cache: 'no-store' },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
