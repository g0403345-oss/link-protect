import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import DiscordProvider from 'next-auth/providers/discord';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    /** Set when the Discord token could not be refreshed — client must re-auth. */
    error?: 'RefreshTokenError';
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Unix seconds when the Discord access token expires. */
    expiresAt?: number;
    error?: 'RefreshTokenError';
    id?: string;
  }
}

// Refresh the Discord access token ~24h before it expires (tokens last 7 days).
// The wide buffer means the rotation happens during a normal session poll long
// before anything actually breaks, so parallel API calls never race the refresh.
const REFRESH_BUFFER_S = 24 * 60 * 60;

// Discord rotates refresh tokens (single use). Coalesce concurrent refreshes in
// this server instance so two parallel getServerSession calls don't burn the
// same refresh token twice — the loser would invalidate the winner's session.
const _inflight = new Map<string, Promise<JWT>>();

async function refreshDiscordToken(token: JWT): Promise<JWT> {
  const refreshToken = token.refreshToken!;
  const existing = _inflight.get(refreshToken);
  if (existing) return existing;

  const p = (async (): Promise<JWT> => {
    try {
      const res = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Discord refresh failed: ${res.status}`);
      return {
        ...token,
        accessToken: data.access_token as string,
        refreshToken: (data.refresh_token as string) ?? refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 604800),
        error: undefined,
      };
    } catch (err) {
      console.error('[auth] Discord token refresh failed:', err);
      return { ...token, error: 'RefreshTokenError' as const };
    }
  })();

  _inflight.set(refreshToken, p);
  // Keep the settled promise briefly so a straggler reuses the result instead
  // of retrying with the now-consumed refresh token.
  setTimeout(() => _inflight.delete(refreshToken), 60_000).unref?.();
  return p;
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify guilds',
          // Skip the consent screen for already-authorized users, so an
          // automatic re-auth (expired session) is a silent redirect.
          prompt: 'none',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        // Initial sign-in: capture the full token bundle, not just the access
        // token — without refresh_token/expires_at the session silently dies
        // after 7 days while the NextAuth cookie lives on.
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.error = undefined;
        token.id = profile?.sub ?? (profile as Record<string, unknown>)?.id as string;
        return token;
      }
      if (!token.expiresAt || Date.now() / 1000 < token.expiresAt - REFRESH_BUFFER_S) {
        return token;
      }
      if (!token.refreshToken) {
        // Session predates the refresh-token rollout — force a re-auth.
        return { ...token, error: 'RefreshTokenError' as const };
      }
      return refreshDiscordToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (session.user) {
        session.user.id = token.id as string ?? token.sub ?? '';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
};
