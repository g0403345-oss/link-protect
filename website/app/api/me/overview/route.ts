import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild } from '@/lib/discord';
import { isAdmin } from '@/lib/admin';
import { getGuildsOverview } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Batch stats for the all-servers overview + row sparklines. Ids are filtered
// to guilds the caller actually manages so nobody can probe foreign servers.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const requested = (body.ids ?? []).map(String).slice(0, 50);
  let allowed = requested;
  if (!isAdmin(session.user.id)) {
    try {
      const guilds = await getUserGuilds(session.accessToken);
      const managed = new Set(
        guilds.filter((g) => g.owner || hasManageGuild(g.permissions)).map((g) => g.id),
      );
      allowed = requested.filter((id) => managed.has(id));
    } catch {
      return NextResponse.json({ error: 'Discord unavailable' }, { status: 502 });
    }
  }
  if (allowed.length === 0) return NextResponse.json({ guilds: {} });
  try {
    return NextResponse.json(await getGuildsOverview(allowed));
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
