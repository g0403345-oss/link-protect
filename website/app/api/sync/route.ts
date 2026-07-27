import { NextRequest, NextResponse } from 'next/server';
import { canAccessGuild } from '@/lib/access';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // syncing writes several settings docs

const BOT_API_URL = process.env.BOT_API_URL ?? 'http://localhost:3001';
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? 'change-me-in-production';

const VALID_SECTIONS = ['protect', 'warn', 'messages', 'scamguard', 'raid', 'decay', 'blacklist'] as const;

// Settings sync (Premium on the source server): copy chosen sections from one
// server to others. The user must have dashboard access to the source AND
// every target — verified here, per guild, before anything is forwarded.
export async function POST(req: NextRequest) {
  let body: { sourceGuildId?: string; targetGuildIds?: string[]; sections?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const source = body.sourceGuildId;
  if (!source || !/^\d{5,25}$/.test(source)) {
    return NextResponse.json({ error: 'Invalid source server' }, { status: 400 });
  }
  const targets = Array.from(new Set(
    (Array.isArray(body.targetGuildIds) ? body.targetGuildIds : [])
      .filter((t): t is string => typeof t === 'string' && /^\d{5,25}$/.test(t) && t !== source)
  ));
  if (targets.length === 0) {
    return NextResponse.json({ error: 'Pick at least one target server' }, { status: 400 });
  }
  if (targets.length > 25) {
    return NextResponse.json({ error: 'Too many target servers (max 25)' }, { status: 400 });
  }
  const sections = Array.from(new Set(
    (Array.isArray(body.sections) ? body.sections : [])
      .filter((s): s is typeof VALID_SECTIONS[number] => (VALID_SECTIONS as readonly string[]).includes(s))
  ));
  if (sections.length === 0) {
    return NextResponse.json({ error: 'Pick at least one section' }, { status: 400 });
  }

  // Access check on the source and EVERY target (getUserGuilds is cached per
  // token, so this doesn't hammer Discord).
  const sourceAccess = await canAccessGuild(source);
  if (!sourceAccess.ok) return NextResponse.json({ error: 'Forbidden' }, { status: sourceAccess.status });
  const targetAccess = await Promise.all(targets.map((t) => canAccessGuild(t)));
  if (targetAccess.some((a) => !a.ok)) {
    return NextResponse.json({ error: 'You lack access to one of the target servers' }, { status: 403 });
  }

  try {
    const res = await fetch(`${BOT_API_URL}/api/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_API_SECRET}`,
        'Content-Type': 'application/json',
        ...(sourceAccess.userId ? { 'X-Actor-Id': sourceAccess.userId } : {}),
      },
      body: JSON.stringify({ sourceGuildId: source, targetGuildIds: targets, sections }),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Bot API unreachable' }, { status: 503 });
  }
}
