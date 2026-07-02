import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { forwardVote } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// top.gg's (v1) webhooks are HMAC-signed, Standard-Webhooks / Stripe style — NOT
// a plaintext Authorization header. Each request carries:
//   x-topgg-signature: t=<unix>,v1=<hex>
// where the hex is HMAC-SHA256(signingSecret, `${t}.${rawBody}`). The signing
// secret is the whole `whs_…` value from the top.gg webhook dashboard, stored
// here as TOPGG_WEBHOOK_SECRET. Payload shape:
//   { type: "vote.create" | "webhook.test",
//     data: { user: { platform_id: "<discord id>" }, weight, … } }
// We must reply 2xx within 5s or top.gg retries (up to 10x).
const TOLERANCE_S = 600; // accept signatures timestamped within 10 minutes

function verify(secret: string, sigHeader: string | null, rawBody: string): boolean {
  if (!sigHeader) return false;
  let t = '';
  const provided: string[] = [];
  for (const part of sigHeader.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1' && v) provided.push(v);
  }
  if (!t || provided.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return provided.some((p) => {
    const buf = Buffer.from(p, 'hex');
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.TOPGG_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verify(secret, req.headers.get('x-topgg-signature'), raw)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Verified. Record only real votes; a webhook.test just needs a 2xx ack.
  let payload: { type?: string; data?: { user?: { platform_id?: string }; weight?: number } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (payload?.type === 'vote.create') {
    const uid = payload.data?.user?.platform_id;
    if (uid) {
      try {
        await forwardVote({ user: String(uid), type: 'upvote', isWeekend: (payload.data?.weight ?? 1) > 1 });
      } catch {
        /* best-effort — the vote is recorded server-side; don't trigger retries */
      }
    }
  }
  return NextResponse.json({ ok: true });
}
