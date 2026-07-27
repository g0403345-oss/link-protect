import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Watchlist (Premium): temporarily keep an eye on suspicious members. The bot
// API answers 403 with a detail message when the guild has no Premium — pass
// the status through so the UI can show the lock note / toast.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/watchlist`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  let body: { userId?: string; days?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.userId || !/^\d{5,25}$/.test(body.userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }
  const days = Math.round(Number(body.days));
  if (!Number.isFinite(days) || days < 1 || days > 30) {
    return NextResponse.json({ error: 'Days must be 1–30' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/watchlist`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'Content-Type': 'application/json',
        ...(access.userId ? { 'X-Actor-Id': access.userId } : {}),
      },
      body: JSON.stringify({
        userId: body.userId,
        days,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : undefined,
      }),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
