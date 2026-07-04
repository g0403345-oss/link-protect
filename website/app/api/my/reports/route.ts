import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMyReports } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ reports: [] });
  }
  try {
    return NextResponse.json(await getMyReports());
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable', reports: [] }, { status: 503 });
  }
}
