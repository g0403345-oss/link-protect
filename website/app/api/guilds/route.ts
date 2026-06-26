import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild, getGuildIconUrl, type DiscordGuild } from '@/lib/discord';
import { getAllGuildIds } from '@/lib/db';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

export interface EnrichedGuild {
  id: string;
  name: string;
  icon: string | null;
  iconUrl: string;
  owner: boolean;
  permissions: string;
  botPresent: boolean;
  approximate_member_count?: number;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user guilds + bot guild IDs in parallel
    const [userGuildsResult, botIdsResult] = await Promise.allSettled([
      getUserGuilds(session.accessToken),
      getAllGuildIds(),
    ]);

    if (userGuildsResult.status === 'rejected') {
      console.error('[API /guilds] Failed to fetch user guilds:', userGuildsResult.reason);
      return NextResponse.json({ error: 'Failed to fetch guilds from Discord' }, { status: 502 });
    }

    const userGuilds = userGuildsResult.value;
    const botGuildIds = new Set<string>(
      botIdsResult.status === 'fulfilled' ? botIdsResult.value : []
    );

    // Filter to guilds where user has Manage Guild permission
    const manageableGuilds = userGuilds.filter(
      (g) => g.owner || hasManageGuild(g.permissions)
    );

    const enriched: EnrichedGuild[] = manageableGuilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      iconUrl: getGuildIconUrl(guild),
      owner: guild.owner,
      permissions: guild.permissions,
      botPresent: botGuildIds.has(guild.id),
      approximate_member_count: guild.approximate_member_count,
    }));

    // Add servers the user was granted delegated access to (editor) but doesn't
    // manage on Discord — otherwise they'd never see them in their server list.
    try {
      const userId = session.user?.id;
      if (userId) {
        const res = await fetch(`${BOT_API_URL}/api/user/${userId}/editor-guilds`, {
          headers: { Authorization: `Bearer ${BOT_API_SECRET}` }, cache: 'no-store',
        });
        if (res.ok) {
          const d = await res.json();
          const have = new Set(enriched.map((g) => g.id));
          for (const g of (d.guilds ?? []) as { id: string; name: string | null; icon: string | null }[]) {
            if (have.has(g.id)) continue;
            enriched.push({
              id: g.id,
              name: g.name ?? g.id,
              icon: g.icon,
              iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=128` : '',
              owner: false,
              permissions: '0',
              botPresent: true,
            });
          }
        }
      }
    } catch { /* editor guilds are best-effort */ }

    // Sort: bot present first, then by name
    enriched.sort((a, b) => {
      if (a.botPresent && !b.botPresent) return -1;
      if (!a.botPresent && b.botPresent) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[API /guilds] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
