'use client';

import { Suspense, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

const DISCORD_LOGO = (
  <svg width="20" height="16" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.292408 45.3914C0.304405 45.5064 0.372206 45.6157 0.463563 45.6915C6.45866 50.0533 12.2718 52.7639 17.9862 54.5544C18.0786 54.5826 18.1765 54.5489 18.2349 54.4717C19.5552 52.6808 20.7321 50.7925 21.7423 48.8068C21.803 48.6889 21.7451 48.5483 21.6218 48.5032C19.7604 47.7939 17.9862 46.9254 16.2769 45.934C16.1398 45.854 16.1285 45.6579 16.2544 45.5631C16.6176 45.2903 16.9808 45.0063 17.328 44.7197C17.3921 44.6652 17.4817 44.6511 17.5598 44.6849C29.2429 49.9213 41.8662 49.9213 53.4087 44.6849C53.4868 44.6483 53.5764 44.6624 53.6433 44.7169C53.9906 45.0035 54.3538 45.2903 54.7198 45.5631C54.8457 45.6579 54.8372 45.854 54.7001 45.934C52.9908 46.9451 51.2166 47.7939 49.3524 48.5004C49.2291 48.5455 49.174 48.6889 49.2347 48.8068C50.2676 50.7897 51.4445 52.678 52.7421 54.4689C52.7977 54.5489 52.8984 54.5826 52.9908 54.5544C58.7277 52.7639 64.5409 50.0533 70.536 45.6915C70.6302 45.6157 70.6951 45.5092 70.7071 45.3942C72.1917 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978Z" fill="white" />
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
            <div style={{ width: 56, height: 56, background: '#5865f2', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(88,101,242,0.35)' }}>
              <Shield size={26} color="#fff" strokeWidth={2.5} />
            </div>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5', textAlign: 'center', marginBottom: 6, letterSpacing: '-0.02em' }}>Sign in to LinkProtect</h1>
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
            We only request <span style={{ color: '#949ba4' }}>identify</span> and <span style={{ color: '#949ba4' }}>guilds</span> scopes.<br />
            We never store messages or personal data.
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
