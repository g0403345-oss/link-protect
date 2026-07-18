import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
};

/**
 * Legacy endpoint. The bell polls /api/notifications now — the old SSE proxy
 * held a Vercel function open for every signed-in tab 24/7 and dominated the
 * Fluid provisioned-memory bill. This handler stays only for browsers still
 * running the old bundle: it returns ONE snapshot and closes immediately, with
 * `retry: 60000` so their EventSource reconnects just once a minute (a short,
 * cheap invocation) instead of holding a stream open.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const retry = 'retry: 60000\n';
  if (!session?.user?.id) {
    return new Response(retry + 'event: end\ndata: {}\n\n', { headers: SSE_HEADERS });
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${BOT_API_SECRET}`,
    'X-Actor-Id': session.user.id,
  };
  if (session.user.name) headers['X-Actor-Name'] = encodeURIComponent(session.user.name);

  try {
    const res = await fetch(`${BOT_API_URL}/api/notifications`, { headers, cache: 'no-store' });
    const payload = res.ok ? await res.text() : '{}';
    return new Response(retry + `data: ${payload}\n\n`, { headers: SSE_HEADERS });
  } catch {
    return new Response(retry + 'data: {}\n\n', { headers: SSE_HEADERS });
  }
}
