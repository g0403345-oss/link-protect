import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';
import { patchDevWebhook, deleteDevWebhook, type WebhookEvent } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; whId: string }> }
) {
  const { id, whId } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  let body: { url?: string; events?: WebhookEvent[]; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    return NextResponse.json(await patchDevWebhook(id, Number(whId), body));
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m.includes('400')) return NextResponse.json({ error: 'Invalid webhook URL or events' }, { status: 400 });
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; whId: string }> }
) {
  const { id, whId } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    await deleteDevWebhook(id, Number(whId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
