import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserFlags, setUserFlags } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Per-account UI flags (e.g. whether the dashboard tour was completed). Keyed to
// the Discord user id so they persist across devices and re-logins.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getUserFlags(session.user.id));
  } catch {
    // Fail soft — a missing flag just means the tour may show once more.
    return NextResponse.json({ tourSeen: false });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { tourSeen?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body — nothing to update */
  }
  try {
    return NextResponse.json(await setUserFlags(session.user.id, body));
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
