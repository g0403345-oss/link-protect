import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild } from '@/lib/discord';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

/**
 * Guild IDs the signed-in user manages (Manage-Guild on Discord + delegated
 * editor access). Used to scope guild notifications to their servers.
 */
export async function getManagedGuildIds(): Promise<string[]> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || !session.user?.id) return [];
  const ids = new Set<string>();
  try {
    const guilds = await getUserGuilds(session.accessToken);
    for (const g of guilds) if (g.owner || hasManageGuild(g.permissions)) ids.add(g.id);
  } catch { /* Discord unreachable — fall back to editor guilds only */ }
  try {
    const res = await fetch(`${BOT_API_URL}/api/user/${session.user.id}/editor-guilds`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const d = await res.json();
      for (const g of (d.guilds ?? []) as { id: string }[]) ids.add(g.id);
    }
  } catch { /* best-effort */ }
  return [...ids];
}
