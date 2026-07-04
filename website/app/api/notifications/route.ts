import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNotifications } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ notifications: [], unread: 0, seenAt: 0 });
  }
  try {
    return NextResponse.json(await getNotifications());
  } catch {
    return NextResponse.json(
      { error: 'Bot API unreachable', notifications: [], unread: 0, seenAt: 0 },
      { status: 503 }
    );
  }
}
