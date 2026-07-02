import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { submitReport, type ReportType } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TYPES: ReportType[] = ['malicious_link', 'false_positive', 'bug', 'feedback'];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to report.' }, { status: 401 });
  }
  let body: { type?: ReportType; url?: string; category?: string; message?: string; guildId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.type || !TYPES.includes(body.type)) {
    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
  }
  if (!body.url?.trim() && !body.message?.trim()) {
    return NextResponse.json({ error: 'Add a link or a message.' }, { status: 400 });
  }
  try {
    const r = await submitReport({
      type: body.type,
      url: body.url,
      category: body.category,
      message: body.message,
      guildId: body.guildId,
    });
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: 'Could not submit — try again later.' }, { status: 503 });
  }
}
