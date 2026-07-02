import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: access.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Attribute the action to the signed-in moderator (mirrors the settings audit).
  const session = await getServerSession(authOptions);
  const actorId = access.userId ?? session?.user?.id ?? '';
  const actorName = session?.user?.name ?? '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/moderate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'X-Actor-Id': actorId,
        'X-Actor-Name': encodeURIComponent(actorName),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.detail ?? 'Bot API error' }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
