'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Search, ShieldOff, ShieldAlert, FileWarning, Paperclip,
  Hash, Server, Scale, Activity, Bot, CalendarClock, ExternalLink, ChevronLeft,
} from 'lucide-react';

interface FlaggedRow {
  userId: string; reason: string; incidents: number; guilds: number;
  firstSeen: number; lastSeen: number; username: string | null; avatar: string | null;
}

interface Detail {
  userId: string;
  flag: { reason: string; incidents: number; firstSeen: number; lastSeen: number } | null;
  guilds: { id: string; name: string | null; icon: string | null }[];
  evidence: { guildId: string; guildName: string | null; content: string | null;
    attachments: { name: string; size: number; url: string }[]; channels: number; createdAt: number }[];
  actions: { guildId: string; guildName: string | null; action: string; reason: string;
    warnCount: number; timestamp: number }[];
  appeals: { id: number; status: string; message: string | null; createdAt: number }[];
  profile: { id: string; username: string | null; globalName: string | null; avatar: string | null;
    bot: boolean; publicFlags: number; banner: string | null; createdAt: number } | null;
}

const IMG_RE = /\.(png|jpe?g|gif|webp)(\?|$)/i;
const ACTION_COLOR: Record<string, string> = {
  warned: '#f0b232', kicked: '#e0683c', banned: '#f23f43', timeout: '#5865f2',
};

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function accountAge(ts: number) {
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days < 30) return { label: `${days} Tage`, fresh: true };
  if (days < 365) return { label: `${Math.floor(days / 30)} Monate`, fresh: false };
  return { label: `${(days / 365).toFixed(1)} Jahre`, fresh: false };
}

/** Operator inspector for network-flagged accounts: full Discord profile,
 *  the caught messages, per-server history, appeals — and the unflag switch. */
export default function AdminFlagged() {
  const [rows, setRows] = useState<FlaggedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmUnflag, setConfirmUnflag] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    fetch('/api/admin/flagged')
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(true); else setRows(d.flagged ?? []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (userId: string) => {
    setDetailLoading(true); setConfirmUnflag(false);
    try {
      const res = await fetch(`/api/admin/flagged/${userId}`);
      if (res.ok) setDetail(await res.json() as Detail);
    } finally { setDetailLoading(false); }
  }, []);

  const unflag = async () => {
    if (!detail) return;
    if (!confirmUnflag) {
      setConfirmUnflag(true);
      window.setTimeout(() => setConfirmUnflag(false), 3500);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/flagged/${detail.userId}`, { method: 'DELETE' });
      if (res.ok) { setDetail(null); load(); }
    } finally { setBusy(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.userId.includes(q) || (r.username ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const searchIsId = /^\d{5,25}$/.test(search.trim());
  const searchIdNotListed = searchIsId && !rows.some((r) => r.userId === search.trim());

  return (
    <div>
      {/* search */}
      {!detail && !detailLoading && (
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search size={14} color="#52535a" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Nach Name oder User-ID suchen — beliebige ID prüfbar"
            style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }} />
        </div>
        <button onClick={load} disabled={loading}
          style={{ width: 34, height: 34, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <RefreshCw size={13} color="#6d6f78" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      )}

      {/* look up an arbitrary id that isn't in the flagged list */}
      {!detail && !detailLoading && searchIdNotListed && (
        <button onClick={() => openDetail(search.trim())}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', fontSize: 13, fontWeight: 600, background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.35)', borderRadius: 8, color: '#7289da', cursor: 'pointer' }}>
          <Search size={13} /> ID {search.trim()} inspizieren (nicht geflaggt)
        </button>
      )}

      {!detail && !detailLoading && error && (
        <div style={{ padding: '20px 24px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#f87171' }}>
          Bot API unreachable.
        </div>
      )}

      {!detail && !detailLoading && !error && !loading && filtered.length === 0 && !searchIdNotListed && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <ShieldOff size={30} color="#2e2e36" style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#949ba4' }}>
            {rows.length === 0 ? 'Keine geflaggten Accounts' : 'Kein Treffer'}
          </p>
        </div>
      )}

      {/* list */}
      {!detail && !detailLoading && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((r) => (
          <button key={r.userId} onClick={() => openDetail(r.userId)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
            {r.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`https://cdn.discordapp.com/avatars/${r.userId}/${r.avatar}.webp?size=64`} alt="" style={{ width: 34, height: 34, borderRadius: '50%' }} />
              : <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#6d6f78' }}>?</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5' }}>{r.username ?? 'Unbekannt'}</div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#52535a' }}>{r.userId}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#f0b232', fontWeight: 700 }}>{r.incidents}× erwischt</span>
              <span style={{ fontSize: 12, color: '#f23f43', fontWeight: 700 }}>{r.guilds} Server</span>
              <span style={{ fontSize: 11, color: '#52535a' }}>{relTime(r.lastSeen)}</span>
            </div>
          </button>
        ))}
      </div>
      )}

      {/* detail — inline page, matching the rest of the admin panel */}
      {(detail || detailLoading) && (
        <div style={{ marginTop: 4 }}>
          <button onClick={() => setDetail(null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 14, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
            <ChevronLeft size={14} /> Alle geflaggten Accounts
          </button>
          <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: 22 }}>
            {detailLoading || !detail ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <RefreshCw size={18} color="#52535a" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (
              <>
                {/* header: profile */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  {detail.profile?.avatar
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`https://cdn.discordapp.com/avatars/${detail.userId}/${detail.profile.avatar}.webp?size=128`} alt="" style={{ width: 56, height: 56, borderRadius: '50%' }} />
                    : <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#2e2e36' }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#f2f3f5' }}>
                        {detail.profile?.globalName ?? detail.profile?.username ?? 'Unbekannt'}
                      </span>
                      {detail.profile?.bot && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#fff', background: '#5865f2', borderRadius: 4, padding: '2px 6px' }}>
                          <Bot size={10} /> BOT-ACCOUNT
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#6d6f78' }}>
                      @{detail.profile?.username ?? '—'} · <span style={{ fontFamily: 'monospace' }}>{detail.userId}</span>
                    </div>
                  </div>
                </div>

                {/* key facts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
                  {detail.profile && (() => {
                    const age = accountAge(detail.profile.createdAt);
                    return (
                      <div style={{ background: '#18181b', border: `1px solid ${age.fresh ? 'rgba(242,63,67,0.4)' : '#2e2e36'}`, borderRadius: 9, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', marginBottom: 4 }}>
                          <CalendarClock size={10} /> Account-Alter
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: age.fresh ? '#f23f43' : '#f2f3f5' }}>
                          {age.label} {age.fresh && '⚠️'}
                        </div>
                        <div style={{ fontSize: 10, color: '#52535a', marginTop: 2 }}>seit {fmtDate(detail.profile.createdAt)}</div>
                      </div>
                    );
                  })()}
                  <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 9, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', marginBottom: 4 }}>
                      <ShieldAlert size={10} /> Flag-Status
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: detail.flag ? '#f23f43' : '#23a55a' }}>
                      {detail.flag ? `${detail.flag.incidents}× · ${detail.guilds.length} Server` : 'Nicht geflaggt'}
                    </div>
                    {detail.flag && <div style={{ fontSize: 10, color: '#52535a', marginTop: 2 }}>zuletzt {relTime(detail.flag.lastSeen)}</div>}
                  </div>
                  <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 9, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', marginBottom: 4 }}>
                      <Activity size={10} /> Historie
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#f2f3f5' }}>{detail.actions.length} Aktionen</div>
                    <div style={{ fontSize: 10, color: '#52535a', marginTop: 2 }}>{detail.appeals.length} Appeal(s)</div>
                  </div>
                </div>

                {/* unflag */}
                {detail.flag && (
                  <button onClick={unflag} disabled={busy}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18, padding: '10px 16px', fontSize: 13, fontWeight: 800, borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(35,165,90,0.5)', background: confirmUnflag ? '#23a55a' : 'rgba(35,165,90,0.1)', color: confirmUnflag ? '#fff' : '#23a55a' }}>
                    <ShieldOff size={14} /> {confirmUnflag ? 'Bestätigen — Flag netzwerkweit entfernen?' : 'Flag aufheben'}
                  </button>
                )}

                {/* evidence: what they actually posted */}
                <SectionLabel icon={<FileWarning size={11} />} text={`Erwischte Nachrichten (${detail.evidence.length})`} color="#f0b232" />
                {detail.evidence.length === 0 && <Empty text="Keine gespeicherten Nachrichten (Flag entstand vor der Evidence-Funktion). Andere Nachrichten speichern wir aus Datenschutzgründen nicht." />}
                {detail.evidence.map((ev, i) => (
                  <div key={i} style={{ background: '#18181b', border: '1px solid rgba(240,178,50,0.25)', borderLeft: '3px solid #f0b232', borderRadius: 8, padding: '9px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#52535a', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Hash size={10} /> {ev.channels} Channels</span>
                      <a href={`/dashboard/${ev.guildId}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#7289da', textDecoration: 'none' }}><Server size={10} /> {ev.guildName ?? `Server …${ev.guildId.slice(-4)}`}</a>
                      <span style={{ marginLeft: 'auto' }}>{fmtDate(ev.createdAt)}</span>
                    </div>
                    {ev.content && <p style={{ fontSize: 12.5, fontFamily: 'monospace', color: '#e0e1e5', lineHeight: 1.5, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{ev.content}</p>}
                    {ev.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: ev.content ? 8 : 0 }}>
                        {ev.attachments.map((at, j) => IMG_RE.test(at.url || at.name) ? (
                          <a key={j} href={at.url} target="_blank" rel="noreferrer" title={at.name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={at.url} alt={at.name} style={{ maxWidth: 200, maxHeight: 130, borderRadius: 6, border: '1px solid #2e2e36', display: 'block' }}
                              onError={(e) => { (e.currentTarget.parentElement as HTMLElement).innerHTML = `🖼️ ${at.name} (CDN abgelaufen)`; }} />
                          </a>
                        ) : (
                          <a key={j} href={at.url} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#7289da', textDecoration: 'none', background: '#111113', border: '1px solid #2e2e36', borderRadius: 6, padding: '4px 9px' }}>
                            <Paperclip size={11} /> {at.name} <span style={{ color: '#52535a' }}>({Math.round(at.size / 1024)} KB)</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* guilds where caught */}
                {detail.guilds.length > 0 && (
                  <>
                    <SectionLabel icon={<Server size={11} />} text={`Erwischt auf (${detail.guilds.length})`} color="#f23f43" />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      {detail.guilds.map((g) => (
                        <a key={g.id} href={`/dashboard/${g.id}`} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#c9ccd4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 99, padding: '4px 11px', textDecoration: 'none' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#5865f2'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2e2e36'; e.currentTarget.style.color = '#c9ccd4'; }}>
                          {g.icon && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=32`} alt="" style={{ width: 16, height: 16, borderRadius: '50%' }} />
                          )}
                          {g.name ?? `Server …${g.id.slice(-6)}`}
                          <ExternalLink size={10} style={{ opacity: 0.6 }} />
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {/* appeals */}
                {detail.appeals.length > 0 && (
                  <>
                    <SectionLabel icon={<Scale size={11} />} text={`Appeals (${detail.appeals.length})`} color="#23a55a" />
                    {detail.appeals.map((a) => (
                      <div key={a.id} style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12.5, color: '#949ba4' }}>
                        <span style={{ fontWeight: 700, color: '#f2f3f5' }}>#{a.id}</span>{' '}
                        <span style={{ textTransform: 'capitalize', color: a.status === 'resolved' ? '#23a55a' : a.status === 'dismissed' ? '#f23f43' : '#f0b232' }}>{a.status}</span>
                        {' · '}{fmtDate(a.createdAt)}
                        {a.message && <div style={{ marginTop: 4 }}>{a.message}</div>}
                      </div>
                    ))}
                  </>
                )}

                {/* action history */}
                <SectionLabel icon={<Activity size={11} />} text={`Moderations-Historie (${detail.actions.length})`} color="#5865f2" />
                {detail.actions.length === 0 && <Empty text="Keine Aktionen aufgezeichnet." />}
                {detail.actions.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid #1a1a1e', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: ACTION_COLOR[a.action] ?? '#949ba4', textTransform: 'capitalize', flexShrink: 0 }}>{a.action}</span>
                    <span style={{ color: '#949ba4', minWidth: 0 }}>{a.reason}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#52535a', flexShrink: 0 }}>
                      <a href={`/dashboard/${a.guildId}`} target="_blank" rel="noreferrer" style={{ color: '#7289da', textDecoration: 'none' }}>{a.guildName ?? `Server …${a.guildId.slice(-4)}`}</a> · {fmtDate(a.timestamp)}
                    </span>
                  </div>
                ))}

                <a href={`https://discord.com/users/${detail.userId}`} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 12, fontWeight: 600, color: '#7289da', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> Discord-Profil öffnen
                </a>
              </>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SectionLabel({ icon, text, color }: { icon: React.ReactNode; text: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 8px' }}>
      {icon} {text}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>{text}</p>;
}
