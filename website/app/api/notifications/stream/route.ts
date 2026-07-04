import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-store, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * Real-time notification stream (Server-Sent Events). Proxies the bot API's SSE
 * feed so the browser gets ticket notifications instantly instead of polling.
 * The upstream stream ends after ~50s; the browser's EventSource reconnects,
 * staying within the serverless function time limit.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('event: end\ndata: {}\n\n', { headers: SSE_HEADERS });
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${BOT_API_SECRET}`,
    'X-Actor-Id': session.user.id,
  };
  if (session.user.name) headers['X-Actor-Name'] = encodeURIComponent(session.user.name);

  try {
    const res = await fetch(`${BOT_API_URL}/api/notifications/stream`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok || !res.body) {
      return new Response('event: end\ndata: {}\n\n', { headers: SSE_HEADERS });
    }
    return new Response(res.body, { headers: SSE_HEADERS });
  } catch {
    return new Response('event: end\ndata: {}\n\n', { headers: SSE_HEADERS });
  }
}
