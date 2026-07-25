import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';
import { sendTestMessage } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set([
  'warn_channel', 'warn_manual', 'warn_dm', 'action_dm', 'verify_dm', 'lockdown_announce',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  let body: { kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Unknown template kind' }, { status: 400 });
  }
  try {
    return NextResponse.json(await sendTestMessage(id, kind));
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
