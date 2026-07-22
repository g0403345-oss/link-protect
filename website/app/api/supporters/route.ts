import { NextResponse } from 'next/server';
import { getSupporters } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public — the "supported this month by" avatar wall on the landing page.
export async function GET() {
  try {
    return NextResponse.json(await getSupporters());
  } catch {
    return NextResponse.json({ month: '', count: 0, supporters: [] });
  }
}
