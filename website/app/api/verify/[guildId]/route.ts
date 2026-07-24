import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVerifyPublic, completeVerify } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public config for the /verify/<guild> page — aggregate info only.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ error: 'Invalid server' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getVerifyPublic(guildId));
  } catch {
    return NextResponse.json({ error: 'Verification is temporarily unavailable.' }, { status: 503 });
  }
}

// Complete verification for the SIGNED-IN user — the user id comes from the
// verified session, never from the request body.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const { guildId } = await params;
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ error: 'Invalid server' }, { status: 400 });
  }
  try {
    return NextResponse.json(await completeVerify(guildId, session.user.id));
  } catch {
    return NextResponse.json({ error: 'Verification is temporarily unavailable.' }, { status: 503 });
  }
}
