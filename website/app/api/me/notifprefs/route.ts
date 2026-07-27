import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNotifPrefs, setNotifPrefs, type NotifPrefs } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KEYS: (keyof NotifPrefs)[] = ['reports', 'developer', 'warnings', 'settings'];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getNotifPrefs());
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: Partial<NotifPrefs>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // Only known boolean keys reach the bot API.
  const prefs: Partial<NotifPrefs> = {};
  for (const k of KEYS) {
    if (typeof body[k] === 'boolean') prefs[k] = body[k];
  }
  try {
    return NextResponse.json(await setNotifPrefs(prefs));
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
