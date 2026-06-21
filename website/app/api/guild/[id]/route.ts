import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild } from '@/lib/discord';
import { getServerData, patchSetting, type ServerData } from '@/lib/db';
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
    const data = await getServerData(id);
    if (!data) {
      return NextResponse.json({ error: 'Server not found in database' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API /guild/:id GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
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

    let body: { path: string; value: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { path, value } = body;
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    await patchSetting(id, path, value);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /guild/:id PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
