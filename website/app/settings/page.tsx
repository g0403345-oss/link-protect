'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Code2, Clock, CheckCircle2, XCircle, Send, RefreshCw, User } from 'lucide-react';
import Navbar from '@/components/Navbar';
import type { DevStatus } from '@/lib/db';

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Code2; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon size={14} color="#5865f2" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>{title}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dev, setDev] = useState<DevStatus | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/me/dev')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setDev(d as DevStatus); })
      .catch(() => {});
  }, [status]);

  const apply = async () => {
    if (sending) return;
    setSending(true); setError(null);
    try {
      const res = await fetch('/api/me/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Request failed — please try again.'); }
      else { setDev(d as DevStatus); setMessage(''); }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSending(false);
    }
  };

  if (status !== 'authenticated') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid #5865f2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 60 }}>
      <Navbar />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 96px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f2f3f5', letterSpacing: '-0.02em', marginBottom: 4 }}>Settings</h1>
          <p style={{ fontSize: 13, color: '#52535a' }}>Your account and developer options</p>
        </div>

        <Card title="Account" icon={User}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {session.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" style={{ width: 44, height: 44, borderRadius: '50%' }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: '#fff' }}>
                {session.user?.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5' }}>{session.user?.name}</div>
              <div style={{ fontSize: 12, color: '#52535a', fontFamily: 'monospace' }}>{session.user?.id}</div>
            </div>
          </div>
        </Card>

        <Card title="Developer Access" icon={Code2}>
          <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.6, marginBottom: 14 }}>
            Developer access unlocks the <b style={{ color: '#f2f3f5' }}>Developer tab</b> in your server
            dashboards — starting with the embeddable live &ldquo;Protected by Link Protect&rdquo; badge for
            your website or GitHub README, with more integrations to come. Requests are reviewed
            manually; you&rsquo;ll get a notification here once yours is decided.
          </p>

          {!dev ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#52535a', fontSize: 13 }}>
              <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading status…
            </div>
          ) : dev.status === 'approved' ? (
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(35,165,90,0.07)', border: '1px solid rgba(35,165,90,0.25)', borderRadius: 8 }}>
              <CheckCircle2 size={16} color="#23a55a" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#23a55a', marginBottom: 3 }}>You&rsquo;re a developer</div>
                <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>
                  Open any server dashboard and look for the <b>Developer</b> tab in the sidebar.
                </p>
              </div>
            </div>
          ) : dev.status === 'pending' ? (
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(240,178,50,0.07)', border: '1px solid rgba(240,178,50,0.25)', borderRadius: 8 }}>
              <Clock size={16} color="#f0b232" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f0b232', marginBottom: 3 }}>Request pending</div>
                <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>
                  Your request is being reviewed — you&rsquo;ll get a bell notification as soon as it&rsquo;s decided.
                </p>
              </div>
            </div>
          ) : (
            <>
              {dev.status === 'denied' && (
                <div style={{ display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 14, background: 'rgba(242,63,67,0.06)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 8 }}>
                  <XCircle size={16} color="#f23f43" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>
                    Your previous request wasn&rsquo;t approved. You&rsquo;re welcome to apply again — a short
                    note about what you&rsquo;re building helps.
                  </p>
                </div>
              )}
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>
                What do you want to build? <span style={{ color: '#52535a', fontWeight: 400 }}>(optional, but helps)</span>
              </label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3}
                placeholder="e.g. I want to embed the protection badge on our community website…"
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}
              />
              {error && <p style={{ fontSize: 12.5, color: '#f23f43', marginBottom: 10 }}>{error}</p>}
              <button onClick={apply} disabled={sending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
                {sending ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                Request developer access
              </button>
            </>
          )}
        </Card>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
