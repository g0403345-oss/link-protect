import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';
import { setupVerifyRole } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // locks every channel sequentially

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccessGuild(id);
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });
  try {
    return NextResponse.json(await setupVerifyRole(id));
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m.includes('400')) {
      return NextResponse.json({ error: 'The bot is missing Manage Roles / Manage Channels permission.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
