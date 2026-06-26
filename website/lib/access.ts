import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGuilds, hasManageGuild } from '@/lib/discord';
import { isAdmin } from '@/lib/admin';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

export interface AccessResult {
  ok: boolean;
  status: 200 | 401 | 403;
  userId?: string;
}

/** Does the signed-in user own / have Manage Server on this guild (or admin)? */
async function evaluate(guildId: string, editorsAllowed: boolean): Promise<AccessResult> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { ok: false, status: 401 };
  const userId = session.user?.id;

  if (isAdmin(userId)) return { ok: true, status: 200, userId };

  try {
    const guilds = await getUserGuilds(session.accessToken);
    const g = guilds.find((x) => x.id === guildId);
    if (g && (g.owner || hasManageGuild(g.permissions))) return { ok: true, status: 200, userId };
  } catch { /* fall through */ }

  if (editorsAllowed && userId) {
    try {
      const res = await fetch(`${BOT_API_URL}/api/guild/${guildId}/editors`, {
        headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const d = await res.json();
        if ((d.editors ?? []).some((e: { id: string }) => e.id === userId)) {
          return { ok: true, status: 200, userId };
        }
      }
    } catch { /* fall through */ }
  }

  return { ok: false, status: 403, userId };
}

/** View/edit a guild's settings: owner, Manage Server, admin, OR delegated editor. */
export function canAccessGuild(guildId: string): Promise<AccessResult> {
  return evaluate(guildId, true);
}

/** Manage the guild itself (e.g. the editor team): owner / Manage Server / admin only. */
export function canManageGuild(guildId: string): Promise<AccessResult> {
  return evaluate(guildId, false);
}
