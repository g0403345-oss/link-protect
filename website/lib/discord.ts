export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
  approximate_member_count?: number;
  approximate_presence_count?: number;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
}

const DISCORD_API = 'https://discord.com/api/v10';
const MANAGE_GUILD = 0x20; // 32

// Per-token cache: avoids Discord 429 when multiple requests fire at once
const _guildCache = new Map<string, { data: DiscordGuild[]; expires: number }>();

export async function getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const cached = _guildCache.get(accessToken);
  if (cached && Date.now() < cached.expires) return cached.data;

  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });

  if (res.status === 429) {
    // Return stale data if available, otherwise throw
    if (cached) return cached.data;
    const retryAfter = Number(res.headers.get('retry-after') ?? 1) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5000)));
    return getUserGuilds(accessToken);
  }

  if (res.status === 401) {
    // Access token expired/revoked — callers translate this into a 401 so the
    // client re-authenticates instead of showing a dead-end retry error.
    throw new Error('DISCORD_UNAUTHORIZED');
  }

  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as DiscordGuild[];
  _guildCache.set(accessToken, { data, expires: Date.now() + 30_000 });
  return data;
}

export async function getBotGuilds(): Promise<DiscordGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${process.env.BOT_TOKEN}`,
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Discord API error fetching bot guilds: ${res.status}`);
  }

  return res.json() as Promise<DiscordGuild[]>;
}

export async function getGuildWithCount(guildId: string): Promise<DiscordGuild | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
    headers: {
      Authorization: `Bot ${process.env.BOT_TOKEN}`,
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) return null;
  return res.json() as Promise<DiscordGuild>;
}

export function hasManageGuild(permissions: string): boolean {
  const perms = BigInt(permissions);
  return (perms & BigInt(MANAGE_GUILD)) !== BigInt(0);
}

export function getGuildIconUrl(guild: DiscordGuild, size = 128): string {
  if (!guild.icon) {
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(guild.id.slice(-1)) % 5}.png`;
  }
  const ext = guild.icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
}

export const BOT_INVITE = `https://discord.com/oauth2/authorize?client_id=888390889892892684&permissions=1376805547126&integration_type=0&scope=bot`;
export const SUPPORT_SERVER = `https://discord.gg/BjDC9t329E`;
export const BOT_ID = '888390889892892684';
export const APP_STORE_URL = 'https://apps.apple.com/de/app/link-protect-server-guard/id6783911538';
