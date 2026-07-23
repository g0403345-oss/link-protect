import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';

/** Forward a public /api/v1/* request to the bot API. Auth is the caller's own
 *  API key (X-Api-Key / Bearer lp_…) — validated + rate-limited on the bot API,
 *  never the internal secret. */
export async function forwardV1(req: NextRequest, path: string): Promise<NextResponse> {
  const key = req.headers.get('x-api-key')
    ?? (req.headers.get('authorization')?.match(/^Bearer\s+(lp_\S+)$/i)?.[1] ?? '');
  if (!key) {
    return NextResponse.json(
      { error: 'Missing API key — send it as an X-Api-Key header. Docs: https://link-protect.com/developers' },
      { status: 401 },
    );
  }
  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${BOT_API_URL}${path}${qs ? `?${qs}` : ''}`, {
      headers: { 'X-Api-Key': key },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({ error: 'Unexpected response' }));
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'The API is temporarily unavailable.' }, { status: 503 });
  }
}
