import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canAccessGuild, canManageGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

function authHeaders() {
  return { Authorization: `Bearer ${BOT_API_SECRET}`, 'Content-Type': 'application/json' };
}

async function authHeadersWithActor(): Promise<Record<string, string>> {
  const h = authHeaders() as Record<string, string>;
  try {
    const s = await getServerSession(authOptions);
    if (s?.user?.id) {
      h['X-Actor-Id'] = s.user.id;
      if (s.user.name) h['X-Actor-Name'] = encodeURIComponent(s.user.name);
    }
  } catch { /* no session */ }
  return h;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/editors`, { headers: authHeaders(), cache: 'no-store' });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Only owners / Manage Server (or admin) can change the team — not editors.
  const access = await canManageGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  let body: { editors?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  try {
    const res = await fetch(`${BOT_API_URL}/api/guild/${id}/editors`, {
      method: 'PUT', headers: await authHeadersWithActor(),
      body: JSON.stringify({ editors: body.editors ?? [] }), cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
