import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Event mode (Premium): block ALL links for 1–12 hours (drops, giveaways).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  let body: { hours?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const hours = Math.round(Number(body.hours));
  if (!Number.isFinite(hours) || hours < 1 || hours > 12) {
    return NextResponse.json({ error: 'Hours must be 1–12' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/eventmode`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'Content-Type': 'application/json',
        ...(access.userId ? { 'X-Actor-Id': access.userId } : {}),
      },
      body: JSON.stringify({ hours }),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/eventmode`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        ...(access.userId ? { 'X-Actor-Id': access.userId } : {}),
      },
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
