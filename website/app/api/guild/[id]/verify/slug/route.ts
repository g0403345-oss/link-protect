import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

// Vanity verify slug (Premium): link-protect.com/verify/<slug>. Empty slug
// removes it. 400 (invalid) / 409 (taken) pass straight through to the UI.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (slug !== '' && !/^[a-z0-9-]{3,32}$/.test(slug)) {
    return NextResponse.json({ error: 'Slug must be 3–32 characters: a–z, 0–9 and dashes' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/verify/slug`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'Content-Type': 'application/json',
        ...(access.userId ? { 'X-Actor-Id': access.userId } : {}),
      },
      body: JSON.stringify({ slug }),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
