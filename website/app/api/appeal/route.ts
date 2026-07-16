import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAppealStatus, submitAppeal } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getAppealStatus());
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to appeal.' }, { status: 401 });
  }
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'Please describe what happened.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitAppeal(body.message.trim()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('409')) {
      return NextResponse.json({ error: 'This account is not flagged.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not submit — try again later.' }, { status: 503 });
  }
}
