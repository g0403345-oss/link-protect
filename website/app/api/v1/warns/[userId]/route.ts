import { NextRequest } from 'next/server';
import { forwardV1 } from '../../_forward';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  return forwardV1(req, `/api/v1/warns/${encodeURIComponent(userId)}`);
}
