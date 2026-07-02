'use client';

import { useState, useRef, useCallback } from 'react';
import { Search, AlertTriangle, Clock, UserX, Ban, X, Loader2, ShieldCheck } from 'lucide-react';

type ActionKind = 'warn' | 'timeout' | 'kick' | 'ban';

interface Member { id: string; username: string; avatar: string | null; nick: string | null }

interface Props {
  guildId: string;
  onToast: (type: 'success' | 'error', msg: string) => void;
  onChanged?: () => void;
}

const ACTIONS: { kind: ActionKind; label: string; color: string; icon: typeof Ban; destructive: boolean }[] = [
  { kind: 'warn', label: 'Warn', color: '#5865f2', icon: AlertTriangle, destructive: false },
  { kind: 'timeout', label: 'Timeout', color: '#5865f2', icon: Clock, destructive: false },
  { kind: 'kick', label: 'Kick', color: '#f0b232', icon: UserX, destructive: true },
  { kind: 'ban', label: 'Ban', color: '#f23f43', icon: Ban, destructive: true },
];

export default function MemberModeration({ guildId, onToast, onChanged }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [confirming, setConfirming] = useState<ActionKind | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const name = (m: Member) => m.nick || m.username;

  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 1) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/guild/${guildId}/discord-members/search?q=${encodeURIComponent(q.trim())}`);
        const d = await res.json();
        setResults(d.members ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, [guildId]);

  const moderate = useCallback(async (action: ActionKind) => {
    if (!selected) return;
    setBusy(action);
    setConfirming(null);
    try {
      const res = await fetch(`/api/guild/${guildId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selected.id,
          username: name(selected),
          action,
          reason: reason.trim() || undefined,
          minutes: action === 'timeout' && minutes ? Number(minutes) : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onToast('error', d?.error ?? 'Action failed'); return; }
      const past = { warn: 'warned', timeout: 'timed out', kick: 'kicked', ban: 'banned' }[action];
      let msg = `${name(selected)} ${past}`;
      if (d.escalated) msg += ` → ${d.escalated === 'ban' ? 'banned' : d.escalated === 'kick' ? 'kicked' : 'timed out'}`;
      onToast('success', msg);
      if (d.escalationError) onToast('error', `Couldn't escalate: ${d.escalationError}`);
      setReason(''); setMinutes('');
      if (action === 'kick' || action === 'ban') { setSelected(null); setQuery(''); setResults([]); }
      onChanged?.();
    } catch { onToast('error', 'Could not reach the server'); }
    finally { setBusy(null); }
  }, [selected, guildId, reason, minutes, onToast, onChanged]);

  const handleClick = (action: ActionKind, destructive: boolean) => {
    if (destructive && confirming !== action) {
      setConfirming(action);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming(null), 3500);
      return;
    }
    moderate(action);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!selected ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8 }}>
            <Search size={15} color="#52535a" />
            <input
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search members by name…"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#f2f3f5', fontSize: 14 }}
            />
            {searching && <Loader2 size={15} color="#52535a" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map((m) => (
                <button key={m.id} onClick={() => { setSelected(m); setResults([]); setQuery(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6d6f78', flexShrink: 0 }}>{name(m).slice(0, 2).toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(m)}</p>
                    <p style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace' }}>{m.id}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 1 && !searching && results.length === 0 && (
            <p style={{ fontSize: 12, color: '#52535a', padding: '4px 2px' }}>No members found.</p>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6d6f78', flexShrink: 0 }}>{name(selected).slice(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>{name(selected)}</p>
              <p style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace' }}>{selected.id}</p>
            </div>
            <button onClick={() => { setSelected(null); setReason(''); setMinutes(''); setConfirming(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', display: 'flex', padding: 4 }}>
              <X size={16} />
            </button>
          </div>

          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{ padding: '9px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, outline: 'none', color: '#f2f3f5', fontSize: 13 }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {ACTIONS.map(({ kind, label, color, icon: Icon, destructive }) => {
              const isConfirming = confirming === kind;
              const isBusy = busy === kind;
              return (
                <button key={kind}
                  onClick={() => handleClick(kind, destructive)}
                  disabled={busy !== null}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '11px 8px', fontSize: 13, fontWeight: 600, borderRadius: 8, whiteSpace: 'nowrap',
                    cursor: busy ? 'default' : 'pointer',
                    color: isConfirming ? '#fff' : color,
                    background: isConfirming ? color : `${color}14`,
                    border: `1px solid ${isConfirming ? color : `${color}40`}`,
                    opacity: busy && !isBusy ? 0.4 : 1,
                  }}>
                  {isBusy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Icon size={14} />}
                  {isBusy ? 'Working…' : isConfirming ? 'Confirm?' : label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={13} color="#52535a" style={{ flexShrink: 0 }} />
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Timeout length in minutes — optional, defaults to your server setting"
              inputMode="numeric"
              style={{ flex: 1, padding: '8px 11px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, outline: 'none', color: '#f2f3f5', fontSize: 12 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#52535a' }}>
            <ShieldCheck size={12} color="#23a55a" />
            <span>Warn follows your kick/ban/timeout thresholds — actions are logged in the activity feed.</span>
          </div>
        </div>
      )}
    </div>
  );
}
