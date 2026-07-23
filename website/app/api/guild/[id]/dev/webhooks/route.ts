import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';
import { listDevWebhooks, createDevWebhook, type WebhookEvent } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    return NextResponse.json(await listDevWebhooks(id));
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
  let body: { url?: string; events?: WebhookEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    return NextResponse.json(await createDevWebhook(id, body.url ?? '', body.events ?? []));
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m.includes('400')) return NextResponse.json({ error: 'Invalid webhook URL or events — the URL must be public https://' }, { status: 400 });
    if (m.includes('409')) return NextResponse.json({ error: 'Webhook limit reached (3 per server)' }, { status: 409 });
    if (m.includes('403')) return NextResponse.json({ error: 'Developer access required' }, { status: 403 });
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
