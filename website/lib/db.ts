/**
 * API client — talks to api_server.py running on the bot host.
 * Set BOT_API_URL and BOT_API_SECRET in .env.local / Vercel dashboard.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const BOT_API_URL = process.env.BOT_API_URL ?? "http://localhost:3001";
const BOT_API_SECRET = process.env.BOT_API_SECRET ?? "change-me-in-production";

// Auth headers for the bot API. Includes the acting user (from the verified
// session) so settings changes can be attributed in the audit log. The name is
// URL-encoded because HTTP headers must be latin-1 (Discord names may have emoji).
async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${BOT_API_SECRET}`,
    "Content-Type": "application/json",
  };
  try {
    const s = await getServerSession(authOptions);
    if (s?.user?.id) {
      h["X-Actor-Id"] = s.user.id;
      if (s.user.name) h["X-Actor-Name"] = encodeURIComponent(s.user.name);
    }
  } catch { /* public/no-session calls (e.g. stats) — no actor */ }
  return h;
}

async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const base = await authHeaders();
    const res = await fetch(`${BOT_API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...base, ...(init?.headers ?? {}) },
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
  link: { links: string[]; allow?: string[] };
  log: { Activated: boolean; "log-channel": number | string; link: number; onlylink: boolean };
  warn: {
    kick: number;
    ban: number;
    timeout: { warnings: number; time: number };
    [userId: string]: unknown;
  };
  safe: Record<string, unknown>;
  decay?: { enabled: boolean; days: number };
  raid?: { enabled: boolean; threshold: number; window: number; timeout_minutes: number };
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

// ── Public link checker ────────────────────────────────────────────────────────

export interface LinkVerdict {
  url: string;
  domain: string;
  safe: boolean;
  category: string | null;
  source: "threat-db" | "safe-browsing" | "clean";
  reason: string;
  seenOnServers: number;
  hits: number;
}

export async function checkLink(url: string): Promise<LinkVerdict> {
  return apiFetch<LinkVerdict>(`/api/check?url=${encodeURIComponent(url)}`);
}

// ── User reports (→ operator admin panel) ──────────────────────────────────────

export type ReportType = "malicious_link" | "false_positive" | "bug" | "feedback";

export interface Report {
  id: number;
  userId: string;
  username: string | null;
  guildId: string | null;
  type: ReportType;
  url: string | null;
  category: string | null;
  message: string | null;
  status: "open" | "reviewed" | "resolved" | "dismissed";
  createdAt: number;
}

export async function submitReport(body: {
  type: ReportType;
  url?: string;
  category?: string;
  message?: string;
  guildId?: string;
}): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/api/report`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getReports(search: string): Promise<{ reports: Report[]; counts: Record<string, number> }> {
  return apiFetch(`/api/admin/reports${search}`);
}

export async function updateReport(id: number, body: { status?: string; promote?: boolean }): Promise<void> {
  await apiFetch(`/api/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

// ── Report threads (two-way conversation) ────────────────────────────────────

export interface ReportMessage {
  id: number;
  sender: "user" | "admin";
  userId: string | null;
  username: string | null;
  body: string;
  createdAt: number;
}

export interface ReportThread {
  report: Report;
  messages: ReportMessage[];
}

export interface MyReport extends Report {
  replyCount: number;
  lastSender: "user" | "admin" | null;
  lastAt: number;
}

export async function getReportThread(id: number): Promise<ReportThread> {
  return apiFetch<ReportThread>(`/api/report/${id}`);
}

export async function postReportMessage(id: number, message: string): Promise<ReportThread> {
  return apiFetch<ReportThread>(`/api/report/${id}/message`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getMyReports(): Promise<{ reports: MyReport[] }> {
  return apiFetch(`/api/my/reports`);
}

// ── Web notification centre ──────────────────────────────────────────────────

export interface WebNotification {
  id: number;
  scope: "user" | "guild";
  scopeId: string;
  type: "report_new" | "report_reply" | "report_status" | "settings" | "warn";
  title: string;
  body: string | null;
  reportId: number | null;
  createdAt: number;
  unread: boolean;
}

export async function getNotifications(): Promise<{
  notifications: WebNotification[];
  unread: number;
  seenAt: number;
}> {
  return apiFetch(`/api/notifications`);
}

export async function markNotificationsSeen(): Promise<{ ok: boolean }> {
  return apiFetch(`/api/notifications/seen`, { method: "POST" });
}

// ── top.gg votes: leaderboard + supporter status ────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string | null;
  avatarUrl: string | null;
  votes: number;
  total: number;
}

export interface VoteStatus {
  hasVoted: boolean;   // true while inside the 12h cooldown (can't vote yet)
  lastVoted: number;
  canVoteAt: number;
  // true when the vote time is a best-guess (learned via top.gg's /check, which
  // has no timestamp) — the UI must not show a precise countdown in that case.
  synced: boolean;
  total: number;
  monthly: number;
  rank: number | null;
  supporter: boolean;
}

export interface UserFlags {
  tourSeen: boolean;
}

export async function getLeaderboard(limit = 10): Promise<{ month: string; leaderboard: LeaderboardEntry[] }> {
  return apiFetch(`/api/leaderboard?limit=${limit}`);
}

export async function getUserVote(userId: string): Promise<VoteStatus> {
  return apiFetch(`/api/user/${userId}/vote`);
}

/** Relay a verified top.gg vote to the bot API. */
export async function forwardVote(body: { user: string; type?: string; isWeekend?: boolean }): Promise<void> {
  await apiFetch(`/api/topgg/webhook`, { method: "POST", body: JSON.stringify(body) });
}

// ── Per-user UI flags (e.g. dashboard-tour completion) ───────────────────────

export async function getUserFlags(userId: string): Promise<UserFlags> {
  return apiFetch(`/api/user/${userId}/flags`);
}

export async function setUserFlags(userId: string, body: { tourSeen?: boolean }): Promise<UserFlags> {
  return apiFetch(`/api/user/${userId}/flags`, { method: "POST", body: JSON.stringify(body) });
}
