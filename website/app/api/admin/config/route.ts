import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return isAdmin(session?.user?.id);
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const res = await fetch(`${BOT_API_URL}/api/admin/config`, {
      headers: { Authorization: `Bearer ${BOT_API_SECRET}` },
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: { lockCommands?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  try {
    const res = await fetch(`${BOT_API_URL}/api/admin/config`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BOT_API_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lockCommands: !!body.lockCommands }),
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
