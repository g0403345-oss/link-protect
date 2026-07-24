'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { ShieldCheck, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react';
import Image from 'next/image';
import type { VerifyPublicConfig } from '@/lib/db';

type Phase = 'loading' | 'ready' | 'verifying' | 'done' | 'failed' | 'disabled';

export default function VerifyClient({ guildId }: { guildId: string }) {
  const { data: session, status } = useSession();
  const [cfg, setCfg] = useState<VerifyPublicConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/verify/${guildId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.error) { setPhase('disabled'); return; }
        setCfg(d as VerifyPublicConfig);
        setPhase(d.enabled ? 'ready' : 'disabled');
      })
      .catch(() => setPhase('disabled'));
  }, [guildId]);

  const verify = async () => {
    if (status !== 'authenticated') {
      signIn('discord', { callbackUrl: `/verify/${guildId}?auto=1` });
      return;
    }
    setPhase('verifying');
    setErrorDetail(null);
    try {
      const res = await fetch(`/api/verify/${guildId}`, { method: 'POST' });
      const d = await res.json();
      if (res.ok && d.ok) { setPhase('done'); return; }
      setErrorDetail(d.detail ?? d.error ?? 'Verification failed — please try again.');
      setPhase('failed');
    } catch {
      setErrorDetail('Could not reach the server — please try again.');
      setPhase('failed');
    }
  };

  // Returning from the OAuth redirect (?auto=1): verify immediately.
  useEffect(() => {
    if (phase !== 'ready' || status !== 'authenticated') return;
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('auto') === '1') {
        window.history.replaceState(null, '', window.location.pathname);
        verify();
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, status]);

  const accent = cfg?.page.accent ?? '#5865f2';

  return (
    <div className="dot-grid" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div aria-hidden style={{ position: 'fixed', inset: 0, background: `radial-gradient(560px circle at 50% 0%, ${accent}26, transparent 65%)`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 420, background: '#111113', border: '1px solid #26262c', borderRadius: 20, padding: '36px 28px', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {phase === 'loading' && (
          <div style={{ padding: '40px 0' }}>
            <div style={{ width: 32, height: 32, border: `2px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        )}

        {phase === 'disabled' && (
          <>
            <XCircle size={40} color="#52535a" style={{ margin: '0 auto 14px' }} />
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f2f3f5', marginBottom: 8 }}>Verification not available</h1>
            <p style={{ fontSize: 13.5, color: '#6d6f78', lineHeight: 1.6 }}>
              This server hasn&rsquo;t enabled the verification gate — or the link is wrong.
            </p>
          </>
        )}

        {(phase === 'ready' || phase === 'verifying' || phase === 'failed') && cfg && (
          <>
            {cfg.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`https://cdn.discordapp.com/icons/${cfg.guildId}/${cfg.icon}.webp?size=128`} alt=""
                style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 14px', display: 'block', border: '2px solid rgba(255,255,255,0.08)' }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 14px', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={30} color="#6d6f78" />
              </div>
            )}
            {cfg.name && <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 6, letterSpacing: '0.02em' }}>{cfg.name}</div>}
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f2f3f5', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 10 }}>
              {cfg.page.headline}
            </h1>
            <p style={{ fontSize: 14, color: '#949ba4', lineHeight: 1.65, marginBottom: 8 }}>{cfg.page.message}</p>
            {cfg.minAccountAgeDays > 0 && (
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#6d6f78', marginBottom: 8 }}>
                <Clock size={11} /> Requires a Discord account older than {cfg.minAccountAgeDays} days
              </p>
            )}

            {phase === 'failed' && errorDetail && (
              <div style={{ margin: '10px 0 4px', padding: '11px 13px', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.25)', borderRadius: 9, fontSize: 12.5, color: '#f87171', lineHeight: 1.5, textAlign: 'left' }}>
                {errorDetail}
              </div>
            )}

            <button onClick={verify} disabled={phase === 'verifying'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 14, padding: '13px 28px', fontSize: 15, fontWeight: 700, background: accent, color: '#fff', border: 'none', borderRadius: 11, cursor: 'pointer', opacity: phase === 'verifying' ? 0.7 : 1, boxShadow: `0 8px 24px ${accent}55` }}>
              {phase === 'verifying'
                ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</>
                : <>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                    </svg>
                    {status === 'authenticated' ? `Verify as ${session?.user?.name ?? 'you'}` : 'Verify with Discord'}
                  </>}
            </button>

            <p style={{ fontSize: 11, color: '#52535a', marginTop: 16, lineHeight: 1.6 }}>
              We only read your Discord identity — never messages, never your email.
            </p>
          </>
        )}

        {phase === 'done' && (
          <>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(35,165,90,0.12)', border: '2px solid rgba(35,165,90,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={34} color="#23a55a" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#23a55a', marginBottom: 8 }}>You&rsquo;re verified!</h1>
            <p style={{ fontSize: 14, color: '#949ba4', lineHeight: 1.6 }}>
              Head back to Discord — {cfg?.name ? <b style={{ color: '#f2f3f5' }}>{cfg.name}</b> : 'the server'} is now unlocked for you.
            </p>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, paddingTop: 16, borderTop: '1px solid #1e1e22' }}>
          <Image src="/logo.webp" alt="" width={16} height={16} style={{ borderRadius: 4 }} />
          <span style={{ fontSize: 11, color: '#52535a' }}>Protected by <a href="https://link-protect.com" style={{ color: '#6d6f78', textDecoration: 'none', fontWeight: 600 }}>Link Protect</a></span>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
