import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

/** Retroactively scan a server's existing members against the flag DB. Same
 *  access bar as moderation — owner / Manage Server / admin / delegated editor. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: access.status });
  }
  const session = await getServerSession(authOptions);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/scamshield/scan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'X-Actor-Id': access.userId ?? session?.user?.id ?? '',
        'X-Actor-Name': encodeURIComponent(session?.user?.name ?? ''),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.detail ?? 'Scan failed' }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ error: 'Bot API unreachable or scan timed out' }, { status: 503 });
  }
}
