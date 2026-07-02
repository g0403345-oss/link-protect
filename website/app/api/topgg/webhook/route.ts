import { NextRequest, NextResponse } from 'next/server';
import { forwardVote } from '@/lib/db';

export const dynamic = 'force-dynamic';

// top.gg POSTs here on every vote with an `Authorization` header equal to the
// secret you set in the top.gg webhook settings. We verify it, then relay the
// vote to the bot API (which records it). Always 2xx so top.gg doesn't retry-storm.
export async function POST(req: NextRequest) {
  const secret = process.env.TOPGG_WEBHOOK_SECRET;
  if (!secret || req.headers.get('authorization') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { user?: string; type?: string; isWeekend?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (body?.user) {
    try {
      await forwardVote({ user: String(body.user), type: body.type, isWeekend: body.isWeekend });
    } catch {
      /* swallow — the vote is best-effort; don't trigger top.gg retries */
    }
  }
  return NextResponse.json({ ok: true });
}
