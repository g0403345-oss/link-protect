import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public — surfaced on the landing page. Fails soft to an empty board.
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 10);
  try {
    return NextResponse.json(await getLeaderboard(Number.isFinite(limit) ? limit : 10));
  } catch {
    return NextResponse.json({ month: '', leaderboard: [] });
  }
}
