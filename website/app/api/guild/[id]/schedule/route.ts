import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Night schedule (Premium): stricter blocking preset during configured hours.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/schedule`, {
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
  let body: { enabled?: boolean; fromHour?: number; toHour?: number; preset?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const fromHour = Math.round(Number(body.fromHour));
  const toHour = Math.round(Number(body.toHour));
  if (![fromHour, toHour].every((h) => Number.isFinite(h) && h >= 0 && h <= 23)) {
    return NextResponse.json({ error: 'Hours must be 0–23' }, { status: 400 });
  }
  if (body.preset !== 'strict' && body.preset !== 'balanced') {
    return NextResponse.json({ error: 'Invalid preset' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/schedule`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'Content-Type': 'application/json',
        ...(access.userId ? { 'X-Actor-Id': access.userId } : {}),
      },
      body: JSON.stringify({ enabled: !!body.enabled, fromHour, toHour, preset: body.preset }),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
