import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

// POST {guildId, interval?: 'month'|'year'} → Stripe Checkout URL
export async function POST(req: NextRequest) {
  let body: { guildId?: string; interval?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const guildId = (body.guildId ?? '').trim();
  if (!/^\d{5,25}$/.test(guildId)) return NextResponse.json({ error: 'Invalid guildId' }, { status: 400 });
  const access = await canAccessGuild(guildId);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  const price = body.interval === 'year'
    ? process.env.STRIPE_PRICE_YEARLY
    : process.env.STRIPE_PRICE_MONTHLY;
  if (!price) return NextResponse.json({ error: 'Billing not configured' }, { status: 500 });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      // guild id on BOTH objects: the session (checkout.completed) and the
      // subscription (updated/deleted events) — the webhook relies on it.
      metadata: { guild_id: guildId },
      subscription_data: { metadata: { guild_id: guildId } },
      success_url: `https://link-protect.com/dashboard/${guildId}?premium=success`,
      cancel_url: `https://link-protect.com/dashboard/${guildId}`,
      allow_promotion_codes: true,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('stripe checkout', e);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 });
  }
}
