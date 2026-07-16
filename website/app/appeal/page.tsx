'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { ShieldAlert, ShieldCheck, MessageSquare, Send, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import Navbar from '@/components/Navbar';
import ReportThread from '@/components/ReportThread';
import type { AppealStatus } from '@/lib/db';

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Under review', color: '#f0b232', icon: Clock },
  reviewed: { label: 'Under review', color: '#5865f2', icon: Clock },
  resolved: { label: 'Accepted — flag removed', color: '#23a55a', icon: CheckCircle2 },
  dismissed: { label: 'Denied', color: '#f23f43', icon: XCircle },
};

export default function AppealPage() {
  const { status: auth } = useSession();
  const [data, setData] = useState<AppealStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/appeal');
      if (res.ok) setData(await res.json() as AppealStatus);
      else setData(null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (auth === 'authenticated') load(); }, [auth, load]);

  const submit = async () => {
    if (!message.trim()) return;
    setSending(true); setError(null);
    try {
      const res = await fetch('/api/appeal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d?.error ?? 'Could not submit.'); }
      else { setMessage(''); await load(); }
    } catch { setError('Network error — try again.'); }
    finally { setSending(false); }
  };

  const card: React.CSSProperties = { background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, padding: 24 };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }} className="dot-grid">
      <Navbar />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '120px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#f87171', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 99, padding: '4px 12px', marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <ShieldAlert size={12} /> Scam Shield
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', color: '#f2f3f5', marginBottom: 10 }}>Appeal a flag</h1>
          <p style={{ fontSize: 14, color: '#6d6f78', lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
            If Link Protect flagged your account as a scam spammer and you believe this was a mistake
            (for example your account was hacked and you have since secured it), you can appeal here.
          </p>
        </div>

        {auth === 'unauthenticated' && (
          <div style={{ ...card, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#949ba4', marginBottom: 18 }}>Sign in with the Discord account that was flagged.</p>
            <button onClick={() => signIn('discord')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 14, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer' }}>
              Continue with Discord
            </button>
          </div>
        )}

        {(auth === 'loading' || (auth === 'authenticated' && loading)) && (
          <div style={{ ...card, display: 'flex', justifyContent: 'center', padding: 40 }}>
            <RefreshCw size={18} color="#52535a" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {auth === 'authenticated' && !loading && data && (() => {
          // Only an open/reviewed appeal blocks a new one — after a decision the
          // flag check runs fresh, so a re-flagged account can appeal again.
          const openAppeal = data.appeal && (data.appeal.status === 'open' || data.appeal.status === 'reviewed');
          return (
          <>
            {/* Current flag check — always visible */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 12, borderRadius: 10, background: data.flagged ? 'rgba(242,63,67,0.07)' : 'rgba(35,165,90,0.07)', border: `1px solid ${data.flagged ? 'rgba(242,63,67,0.25)' : 'rgba(35,165,90,0.25)'}` }}>
              {data.flagged
                ? <ShieldAlert size={17} color="#f23f43" style={{ flexShrink: 0 }} />
                : <ShieldCheck size={17} color="#23a55a" style={{ flexShrink: 0 }} />}
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: data.flagged ? '#f23f43' : '#23a55a' }}>
                  {data.flagged ? 'This account is currently flagged' : 'This account is currently not flagged'}
                </p>
                <p style={{ fontSize: 12, color: '#6d6f78' }}>
                  {data.flagged
                    ? `Caught scam-spamming on ${data.flag?.guilds ?? 1} server(s) — you can appeal below.`
                    : 'Link Protect has no network flag on your account. If you were banned from a specific server, that ban is managed by that server’s staff.'}
                </p>
              </div>
            </div>

            {/* Flagged + no case in review → (new) appeal form */}
            {data.flagged && !openAppeal && (
              <div style={card}>
                <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.6, marginBottom: 6 }}>
                  Your account was caught posting the same message across several channels on{' '}
                  <b style={{ color: '#f2f3f5' }}>{data.flag?.guilds ?? 1} server(s)</b>. Tell us what
                  happened — if your account was compromised, mention when you regained control and
                  what you did to secure it.
                </p>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                  placeholder="Describe what happened…"
                  style={{ width: '100%', marginTop: 10, padding: '10px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                {error && <p style={{ fontSize: 12, color: '#f23f43', marginTop: 8 }}>{error}</p>}
                <button onClick={submit} disabled={sending || !message.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '10px 18px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: sending || !message.trim() ? 0.5 : 1 }}>
                  {sending ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                  Submit appeal
                </button>
              </div>
            )}

            {/* Latest appeal → status + conversation (form above handles new ones) */}
            {data.appeal && (() => {
              const meta = STATUS_META[data.appeal!.status] ?? STATUS_META.open;
              return (
                <div style={{ ...card, marginTop: data.flagged && !openAppeal ? 12 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <meta.icon size={16} color={meta.color} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#52535a' }}>
                      Appeal #{data.appeal.id}
                    </span>
                  </div>
                  {data.appeal.message && (
                    <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.6, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                      {data.appeal.message}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setThreadOpen(true)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: 'rgba(88,101,242,0.12)', color: '#7289da', border: '1px solid rgba(88,101,242,0.4)', borderRadius: 8, cursor: 'pointer' }}>
                      <MessageSquare size={13} /> Open conversation
                    </button>
                  </div>
                  {openAppeal && (
                    <p style={{ fontSize: 12, color: '#52535a', marginTop: 14, lineHeight: 1.5 }}>
                      You&apos;ll get a notification (🔔 top right) whenever the review team replies —
                      you can answer directly in the conversation.
                    </p>
                  )}
                </div>
              );
            })()}
          </>
          );
        })()}
      </main>
      {threadOpen && data?.appeal && (
        <ReportThread reportId={data.appeal.id} onClose={() => { setThreadOpen(false); load(); }} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
