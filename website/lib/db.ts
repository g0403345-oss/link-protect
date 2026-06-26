/**
 * API client — talks to api_server.py running on the bot host.
 * Set BOT_API_URL and BOT_API_SECRET in .env.local / Vercel dashboard.
 */

const BOT_API_URL = process.env.BOT_API_URL ?? "http://localhost:3001";
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? "change-me-in-production";

function authHeaders() {
  return {
    Authorization: `Bearer ${BOT_API_SECRET}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BOT_API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...authHeaders(), ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Bot API ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

// Longer timeout variant for tunnel-dependent calls
async function apiFetchSlow<T>(path: string): Promise<T> {
  return apiFetch<T>(path, undefined, 25_000);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ServerData {
  protect: {
    google: boolean;
    youtube: boolean;
    nsfw: boolean;
    gif: boolean;
    invite: boolean;
    twitch: boolean;
    bit: boolean;
    nitro: boolean;
    all: boolean;
    steam: boolean;
    malware: boolean;
  };
  silent: boolean;
  channel: { channel: string[]; category: string[]; member: string[]; role: string[] };
  link: { links: string[] };
  log: { Activated: boolean; "log-channel": number; link: number; onlylink: boolean };
  warn: {
    kick: number;
    ban: number;
    timeout: { warnings: number; time: number };
    [userId: string]: unknown;
  };
  safe: Record<string, unknown>;
  decay?: { enabled: boolean; days: number };
  overrides?: Record<string, ChannelOverride>;
}

export interface ChannelOverride {
  mode: 'default' | 'off' | 'custom';
  protect?: Partial<ServerData['protect']>;
  silent?: boolean;
}

export interface GlobalStats {
  servers: number;       // live bot guild count
  watchedUsers: number;  // total members across all bot guilds
  warned: number;        // lifetime warnings issued
  kicked: number;        // lifetime kicks
  banned: number;        // lifetime bans
  timeouts: number;      // lifetime timeouts
}

export interface GuildStats {
  totalWarnings: number;
  warnedUsers: number;
  kickThreshold: number;
  banThreshold: number;
  topWarned: { userId: string; warnings: number; reasons: string[] }[];
}

// ── Public (no auth) ─────────────────────────────────────────────────────────

export async function getStats(): Promise<GlobalStats> {
  return apiFetch<GlobalStats>("/api/stats");
}

// ── Authenticated ─────────────────────────────────────────────────────────────

export async function getAllGuildIds(): Promise<string[]> {
  const res = await apiFetchSlow<{ guilds: string[] }>("/api/guilds");
  return res.guilds;
}

export async function getServerData(guildId: string): Promise<ServerData | null> {
  try {
    const res = await apiFetch<{ data: ServerData }>(`/api/guild/${guildId}`);
    return res.data;
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("404")) return null;
    throw e;
  }
}

export async function patchSetting(
  guildId: string,
  path: string,
  value: unknown
): Promise<void> {
  await apiFetch(`/api/guild/${guildId}`, {
    method: "PATCH",
    body: JSON.stringify({ path, value }),
  });
}

export async function patchBlacklist(
  guildId: string,
  action: "add" | "remove",
  link: string
): Promise<string[]> {
  const res = await apiFetch<{ links: string[] }>(
    `/api/guild/${guildId}/blacklist`,
    { method: "PATCH", body: JSON.stringify({ action, link }) }
  );
  return res.links;
}

export async function getGuildStats(guildId: string): Promise<GuildStats> {
  return apiFetch<GuildStats>(`/api/guild/${guildId}/stats`);
}

export async function resetUserWarns(guildId: string, userId: string): Promise<void> {
  await apiFetch(`/api/guild/${guildId}/warns/${userId}`, { method: "DELETE" });
}

export async function setChannelOverride(
  guildId: string,
  channelId: string,
  body: ChannelOverride
): Promise<void> {
  await apiFetch(`/api/guild/${guildId}/override/${channelId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function removeChannelOverride(guildId: string, channelId: string): Promise<void> {
  await apiFetch(`/api/guild/${guildId}/override/${channelId}`, { method: "DELETE" });
}
