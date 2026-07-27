import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { setPremium } from '@/lib/db';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

// Stripe → premium:<gid> in the bot DB. Signature-verified; the guild id
// travels in the metadata we set at checkout time.
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '');
  } catch {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      const gid = s.metadata?.guild_id;
      if (gid && s.subscription) {
        await setPremium(gid, true, String(s.customer ?? ''), String(s.subscription), null);
      }
    } else if (event.type === 'customer.subscription.updated'
            || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const gid = sub.metadata?.guild_id;
      if (gid) {
        const active = event.type !== 'customer.subscription.deleted'
          && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due');
        const until = sub.items?.data?.[0]?.current_period_end ?? null;
        await setPremium(gid, active, String(sub.customer ?? ''), sub.id, until);
      }
    }
  } catch (e) {
    console.error('stripe webhook', e);
    // 200 anyway: the state write failed but retrying the same event won't
    // help more than Stripe's own retry schedule; 5xx would pause the endpoint.
  }
  return NextResponse.json({ received: true });
}
