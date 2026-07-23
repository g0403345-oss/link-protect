'use client';

import { CheckCircle2, ChevronRight, ShieldCheck } from 'lucide-react';
import type { ServerData } from '@/lib/db';

interface ScoreItem {
  key: string;
  label: string;
  hint: string;
  points: number;
  met: boolean;
  section: string;
}

// Only security-relevant settings count — taste toggles (YouTube, GIFs, …)
// never lower the score.
export function scoreItems(data: ServerData): ScoreItem[] {
  const protect = data.protect ?? ({} as ServerData['protect']);
  const warn = data.warn ?? ({} as ServerData['warn']);
  const scamguard = data.scamguard;
  return [
    { key: 'malware', label: 'Malware & phishing blocker', hint: 'Blocks known malware and phishing URLs automatically', points: 15, met: !!protect.malware, section: 'blockers' },
    { key: 'raid', label: 'Raid protection', hint: 'Auto-defends against link raids from hijacked accounts', points: 15, met: !!data.raid?.enabled, section: 'blockers' },
    { key: 'scamshield', label: 'Scam Shield', hint: 'Detects cross-channel scam spam', points: 15, met: !!scamguard?.enabled, section: 'scamshield' },
    { key: 'nitro', label: 'Nitro scam blocker', hint: 'Blocks fake “free Nitro” account-hijack links', points: 10, met: !!protect.nitro, section: 'blockers' },
    { key: 'joincheck', label: 'Known scammer check', hint: 'Removes accounts already caught scamming on other servers', points: 10, met: !!scamguard?.join_check, section: 'scamshield' },
    { key: 'thresholds', label: 'Warning thresholds', hint: 'Repeat offenders get timed out, kicked or banned automatically', points: 10, met: (warn.kick ?? 0) > 0 || (warn.ban ?? 0) > 0 || (warn.timeout?.warnings ?? 0) > 0, section: 'warnings' },
    { key: 'log', label: 'Log channel', hint: 'Every action is posted to a mod channel so nothing goes unnoticed', points: 10, met: !!data.log?.Activated && !!data.log?.['log-channel'], section: 'log' },
    { key: 'bit', label: 'Shortener blocker', hint: 'bit.ly & co. hide where a link really leads', points: 5, met: !!protect.bit, section: 'blockers' },
    { key: 'nsfw', label: 'NSFW blocker', hint: 'Blocks known adult-site links', points: 5, met: !!protect.nsfw, section: 'blockers' },
    { key: 'decay', label: 'Warning decay', hint: 'Old warnings expire so one mistake doesn’t count forever', points: 5, met: !!data.decay?.enabled, section: 'warnings' },
  ];
}

const LEVELS: { min: number; label: string; color: string }[] = [
  { min: 90, label: 'Excellent', color: '#23a55a' },
  { min: 70, label: 'Well protected', color: '#5865f2' },
  { min: 40, label: 'Needs attention', color: '#f0b232' },
  { min: 0, label: 'At risk', color: '#f23f43' },
];

export default function SecurityScore({ data, onNavigate }: {
  data: ServerData;
  onNavigate: (section: string) => void;
}) {
  const items = scoreItems(data);
  const score = items.reduce((s, i) => s + (i.met ? i.points : 0), 0);
  const level = LEVELS.find((l) => score >= l.min)!;
  const todo = items.filter((i) => !i.met);
  const done = items.filter((i) => i.met);

  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', gap: 7 }}>
        <ShieldCheck size={14} color={level.color} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>Security Score</span>
      </div>
      <div style={{ padding: 18, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        {/* Ring */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ position: 'relative', width: 92, height: 92 }}>
            <svg width={92} height={92} viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={46} cy={46} r={R} fill="none" stroke="#1e1e22" strokeWidth={8} />
              <circle cx={46} cy={46} r={R} fill="none" stroke={level.color} strokeWidth={8} strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)}
                style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: level.color, letterSpacing: '-0.03em', lineHeight: 1 }}>{score}</span>
              <span style={{ fontSize: 9, color: '#52535a', fontWeight: 600 }}>/ 100</span>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: level.color }}>{level.label}</span>
        </div>

        {/* Recommendations */}
        <div style={{ flex: 1, minWidth: 240 }}>
          {todo.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0' }}>
              <CheckCircle2 size={16} color="#23a55a" />
              <p style={{ fontSize: 13, color: '#949ba4' }}>Every security feature is active — this server is fully locked down.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: '#52535a', marginBottom: 8 }}>
                Boost your score — each recommendation takes under a minute:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {todo.map((i) => (
                  <button key={i.key} onClick={() => onNavigate(i.section)} title={i.hint}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.15s' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#5865f2')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#2e2e36')}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#23a55a', background: 'rgba(35,165,90,0.1)', border: '1px solid rgba(35,165,90,0.2)', borderRadius: 99, padding: '2px 8px', flexShrink: 0 }}>
                      +{i.points}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f2f3f5' }}>{i.label}</div>
                      <div style={{ fontSize: 11, color: '#52535a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.hint}</div>
                    </div>
                    <ChevronRight size={13} color="#52535a" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </>
          )}
          {done.length > 0 && todo.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
              {done.map((i) => (
                <span key={i.key} title={i.hint} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', fontSize: 11, fontWeight: 500, color: '#23a55a', background: 'rgba(35,165,90,0.08)', border: '1px solid rgba(35,165,90,0.15)', borderRadius: 99 }}>
                  <CheckCircle2 size={10} /> {i.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
