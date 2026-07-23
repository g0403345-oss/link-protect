import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';
import { testDevWebhook } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; whId: string }> }
) {
  const { id, whId } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    return NextResponse.json(await testDevWebhook(id, Number(whId)));
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
