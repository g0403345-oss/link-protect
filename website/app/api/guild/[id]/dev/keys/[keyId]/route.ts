import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';
import { revokeDevKey } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  const { id, keyId } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    await revokeDevKey(id, Number(keyId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
