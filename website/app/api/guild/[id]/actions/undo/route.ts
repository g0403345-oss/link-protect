import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Review-Undo (Premium): revert a false-positive warning, optionally
// allowlisting the domain that triggered it. 403 passes through so the UI
// can show the "Premium feature" toast.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  let body: { userId?: string; domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.userId || !/^\d{5,25}$/.test(body.userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/actions/undo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'Content-Type': 'application/json',
        ...(access.userId ? { 'X-Actor-Id': access.userId } : {}),
      },
      body: JSON.stringify({
        userId: body.userId,
        ...(typeof body.domain === 'string' && body.domain ? { domain: body.domain.toLowerCase().slice(0, 253) } : {}),
      }),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
