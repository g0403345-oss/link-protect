import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { setDevBeta } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    return NextResponse.json(await setDevBeta(session.user.id, !!body.enabled));
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m.includes('403')) return NextResponse.json({ error: 'Developer access required' }, { status: 403 });
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
