import { NextRequest } from 'next/server';
import { forwardV1 } from '../_forward';

export const dynamic = 'force-dynamic';

// The machine-readable spec is public — no key required (one is forwarded if sent).
export async function GET(req: NextRequest) {
  return forwardV1(req, '/api/v1/openapi.json', { requireKey: false });
}
