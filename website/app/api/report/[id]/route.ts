import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReportThread } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    return NextResponse.json(await getReportThread(Number(id)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('403')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (msg.includes('404')) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
