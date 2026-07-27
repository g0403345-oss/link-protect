import { NextRequest, NextResponse } from 'next/server';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';

/** Forward a public /api/v1/* request to the bot API. Auth is the caller's own
 *  API key (X-Api-Key / Bearer lp_…) — validated + rate-limited on the bot API,
 *  never the internal secret. POST bodies are forwarded verbatim.
 *  `requireKey: false` lets keyless requests through (e.g. the OpenAPI spec). */
export async function forwardV1(
  req: NextRequest,
  path: string,
  opts: { method?: 'GET' | 'POST'; requireKey?: boolean } = {},
): Promise<NextResponse> {
  const { method = 'GET', requireKey = true } = opts;
  const key = req.headers.get('x-api-key')
    ?? (req.headers.get('authorization')?.match(/^Bearer\s+(lp_\S+)$/i)?.[1] ?? '');
  if (!key && requireKey) {
    return NextResponse.json(
      { error: 'Missing API key — send it as an X-Api-Key header. Docs: https://link-protect.com/developers' },
      { status: 401 },
    );
  }
  const qs = req.nextUrl.searchParams.toString();
  const headers: Record<string, string> = {};
  if (key) headers['X-Api-Key'] = key;
  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    body = await req.text().catch(() => '');
  }
  try {
    const res = await fetch(`${BOT_API_URL}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
    const resBody = await res.json().catch(() => ({ error: 'Unexpected response' }));
    return NextResponse.json(resBody, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'The API is temporarily unavailable.' }, { status: 503 });
  }
}
