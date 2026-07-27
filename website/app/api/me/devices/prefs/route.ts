import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { setDevicePref, type DevicePrefs } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PREF_KEYS = ['bot_offline', 'rule_triggered', 'settings_changed', 'scam_shield'] as const;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { tail?: string; key?: string; value?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const tail = (body.tail ?? '').trim();
  const key = body.key as keyof DevicePrefs | undefined;
  if (!tail || !key || !(PREF_KEYS as readonly string[]).includes(key) || typeof body.value !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  try {
    return NextResponse.json(await setDevicePref(tail, key, body.value));
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
