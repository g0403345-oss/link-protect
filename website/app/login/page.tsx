'use client';

import { Suspense, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';

// Official Discord logo (current Clyde mark).
const DISCORD_LOGO = (
  <svg width="22" height="17" viewBox="0 0 127.14 96.36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#fff" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
  </svg>
);

const ERRORS: Record<string, string> = {
  OAuthSignin: 'Could not start sign-in. Please try again.',
  OAuthCallback: 'OAuth callback failed. Please try again.',
  OAuthCreateAccount: 'Could not create account. Please try again.',
  Default: 'An error occurred during sign-in. Please try again.',
};

function LoginContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard');
  }, [status, router]);

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} className="dot-grid">
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(88,101,242,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} style={{ width: '100%', maxWidth: 360, position: 'relative' }}>
        {/* Card */}
        <div style={{ background: '#18181b', border: '1px solid #2e2e36', borderRadius: 16, padding: 32 }}>
          {/* Icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="Link Protect" width={56} height={56} style={{ borderRadius: 14, boxShadow: '0 8px 32px rgba(88,101,242,0.35)' }} />
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 6, letterSpacing: '-0.02em' }}>Sign in to Link Protect</h1>
          <p style={{ fontSize: 13, color: '#52535a', textAlign: 'center', marginBottom: 24 }}>Manage your server&apos;s protection settings</p>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: '#f23f43' }}>
              {ERRORS[error] ?? ERRORS.Default}
            </div>
          )}

          {/* Button */}
          <button
            onClick={() => signIn('discord', { callbackUrl: '/dashboard' })}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px 20px', fontSize: 15, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s, transform 0.1s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#4752c4'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#5865f2'; e.currentTarget.style.transform = 'none'; }}
          >
            {DISCORD_LOGO}
            Continue with Discord
          </button>

          <p style={{ fontSize: 12, color: '#52535a', textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
            We only see who you are and which servers you manage —<br />
            never your messages or email.
          </p>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/" style={{ fontSize: 13, color: '#52535a', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#949ba4')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
            ← Back to homepage
          </a>
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'transparent' }} />}>
      <LoginContent />
    </Suspense>
  );
}
