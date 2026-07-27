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
    <div className="dot-grid" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
      {/* Custom server background — absolute (NOT fixed) like the homepage
          hero, so it stays behind the card and never follows the scroll into
          the footer; the mask fades it out completely towards the bottom. */}
      {cfg?.background && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/verify/bg/${cfg.guildId}?v=${cfg.backgroundVersion}`} alt="" aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3, pointerEvents: 'none', WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 60%, transparent 96%)', maskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 60%, transparent 96%)' }} />
      )}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(560px circle at 50% 0%, ${accent}26, transparent 65%)`, pointerEvents: 'none' }} />

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
            {cfg.logo ? (
              // Premium branding: the server's own logo replaces the guild icon.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/verify/logo/${cfg.guildId}?v=${cfg.logoVersion ?? 1}`} alt=""
                style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 14px', display: 'block', objectFit: 'contain' }} />
            ) : cfg.icon ? (
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
              <div style={{ margin: '10px 0 4px', padding: '11px 13px', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.25)', borderRadius: 9, fontSize: 12.5, color: '#f23f43', lineHeight: 1.5, textAlign: 'left' }}>
                {errorDetail}
              </div>
            )}

            <button onClick={verify} disabled={phase === 'verifying'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 14, padding: '13px 28px', fontSize: 15, fontWeight: 700, background: accent, color: '#fff', border: 'none', borderRadius: 11, cursor: 'pointer', opacity: phase === 'verifying' ? 0.5 : 1, boxShadow: `0 8px 24px ${accent}55` }}>
              {phase === 'verifying'
                ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</>
                : <>
                    {/* Official Discord mark uses a 127.14×96.36 viewBox — the
                        24×24 crop was clipping the ears. */}
                    <svg width="19" height="15" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden>
                      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
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

        {!cfg?.premium && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, paddingTop: 16, borderTop: '1px solid #1e1e22' }}>
            <Image src="/logo.webp" alt="" width={16} height={16} style={{ borderRadius: 4 }} />
            <span style={{ fontSize: 11, color: '#52535a' }}>Protected by <a href="https://link-protect.com" style={{ color: '#6d6f78', textDecoration: 'none', fontWeight: 600 }}>Link Protect</a></span>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
