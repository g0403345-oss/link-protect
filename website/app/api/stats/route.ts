import { NextResponse } from 'next/server';
import { getStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getStats();
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[API /stats] Error:', err);
    return NextResponse.json(
      { error: 'Failed to read stats' },
      { status: 500 }
    );
  }
}
