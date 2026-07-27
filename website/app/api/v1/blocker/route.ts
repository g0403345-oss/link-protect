import { NextRequest } from 'next/server';
import { forwardV1 } from '../_forward';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return forwardV1(req, '/api/v1/blocker', { method: 'POST' });
}
