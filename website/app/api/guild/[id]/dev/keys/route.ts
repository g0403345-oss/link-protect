import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';
import { listDevKeys, createDevKey, type DevKeyScope } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    return NextResponse.json(await listDevKeys(id));
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('403') ? 'Developer access required' : 'Bot API unreachable';
    return NextResponse.json({ error: msg }, { status: msg === 'Developer access required' ? 403 : 503 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  let body: { label?: string; scopes?: DevKeyScope[] } = {};
  try { body = await req.json(); } catch { /* empty is fine */ }
  try {
    return NextResponse.json(await createDevKey(id, body.label, body.scopes));
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m.includes('409')) return NextResponse.json({ error: 'Key limit reached (5 per server)' }, { status: 409 });
    if (m.includes('403')) return NextResponse.json({ error: 'Developer access required' }, { status: 403 });
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
