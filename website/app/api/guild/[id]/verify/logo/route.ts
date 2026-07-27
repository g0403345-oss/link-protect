import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Upload / remove the custom verify-page logo (Premium). The dashboard
// downsizes client-side (canvas → ≤256px, ≤512 KB); the bot API re-validates.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  const body = await req.arrayBuffer();
  if (body.byteLength > 512_000) {
    return NextResponse.json({ error: 'Image too large (max 512 KB)' }, { status: 413 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/verify/logo`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      body,
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
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/verify/logo`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
