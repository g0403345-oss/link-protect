import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/** SSE pass-through — the bot API holds the stream open (30-min auto-close,
 *  max 2 concurrent per key). Auth via X-Api-Key header or ?key= query param;
 *  both are forwarded verbatim, never the internal secret. */
export async function GET(req: NextRequest) {
  const headerKey = req.headers.get('x-api-key')
    ?? (req.headers.get('authorization')?.match(/^Bearer\s+(lp_\S+)$/i)?.[1] ?? '');
  const queryKey = req.nextUrl.searchParams.get('key') ?? '';
  if (!headerKey && !queryKey) {
    return NextResponse.json(
      { error: 'Missing API key — send it as an X-Api-Key header or ?key= query param.' },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (headerKey) headers['X-Api-Key'] = headerKey;
  const qs = queryKey ? `?key=${encodeURIComponent(queryKey)}` : '';

  try {
    const upstream = await fetch(`${BOT_API_URL}/api/v1/events/stream${qs}`, {
      headers,
      cache: 'no-store',
    });
    if (!upstream.ok || !upstream.body) {
      const body = await upstream.json().catch(() => ({ error: 'Stream unavailable' }));
      return NextResponse.json(body, { status: upstream.status });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json({ error: 'The API is temporarily unavailable.' }, { status: 503 });
  }
}
