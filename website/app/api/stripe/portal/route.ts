import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { canAccessGuild } from '@/lib/access';
import { getPremium } from '@/lib/db';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

// POST {guildId} → Stripe customer-portal URL (manage / cancel the subscription)
export async function POST(req: NextRequest) {
  let body: { guildId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const guildId = (body.guildId ?? '').trim();
  if (!guildId) return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  const access = await canAccessGuild(guildId);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

  try {
    const premium = await getPremium(guildId);
    if (!premium.customerId) return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    const session = await stripe.billingPortal.sessions.create({
      customer: premium.customerId,
      return_url: `https://link-protect.com/dashboard/${guildId}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('stripe portal', e);
    return NextResponse.json({ error: 'Could not open the billing portal' }, { status: 502 });
  }
}
