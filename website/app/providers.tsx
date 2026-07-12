'use client';

import { useEffect, useRef } from 'react';
import { SessionProvider, useSession, signIn } from 'next-auth/react';

/** When the server couldn't refresh the Discord token (revoked / lost to a
 *  race), silently re-run the OAuth redirect instead of leaving the user in a
 *  broken "logged in but every Discord call fails" state. With prompt=none the
 *  round-trip is invisible for an already-authorized user. */
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const triggered = useRef(false);

  useEffect(() => {
    if (session?.error === 'RefreshTokenError' && !triggered.current) {
      triggered.current = true;
      signIn('discord');
    }
  }, [session?.error]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Re-poll the session every 4h so long-lived tabs rotate the Discord token
    // well inside its 24h refresh window (tokens themselves last 7 days).
    <SessionProvider refetchInterval={4 * 60 * 60} refetchOnWindowFocus>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
