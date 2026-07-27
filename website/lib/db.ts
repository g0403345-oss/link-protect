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
  log: { Activated: boolean; "log-channel": number | string; link: number; onlylink: boolean; show?: Record<string, boolean>; digest?: boolean };
  warn: {
    kick: number;
    ban: number;
    timeout: { warnings: number; time: number };
    [userId: string]: unknown;
  };
  safe: Record<string, unknown>;
  decay?: { enabled: boolean; days: number };
  raid?: { enabled: boolean; threshold: number; window: number; timeout_minutes: number };
  scamguard?: {
    enabled: boolean; channels: number; window: number;
    action: 'delete' | 'timeout' | 'kick' | 'ban'; timeout_minutes: number;
    join_check: boolean; join_action: 'kick' | 'ban'; min_servers: number;
  };
  verify?: {
    enabled?: boolean;
    role_mode?: 'quarantine' | 'verified';
    role_id?: string | null;
    min_account_age_days?: number;
    page?: { headline?: string; message?: string; accent?: string };
  };
  overrides?: Record<string, ChannelOverride>;
  /** Message Studio — custom bot message templates. Empty/missing = default text. */
  messages?: {
    warn_channel?: string;
    warn_manual?: string;
    warn_dm?: string;
    action_dm?: string;
    verify_dm?: string;
    lockdown_announce?: string;
    accent?: string;
  };
}

export interface ChannelOverride {
  mode: 'default' | 'off' | 'custom';
  protect?: Partial<ServerData['protect']>;
  silent?: boolean;
  /** Members/roles exempt from blocking in this channel only. `enabled` lets
   *  the exceptions be switched off without discarding the configured list. */
  allow?: { enabled?: boolean; member?: string[]; role?: string[] };
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

export interface GuildOverviewEntry {
  totalWarnings: number;
  warnedUsers: number;
  activeBlockers: number;
  /** Actions per day, oldest→newest, last 7 days. */
  last7: number[];
  today: number;
  known: boolean;
}

export async function getGuildsOverview(ids: string[]): Promise<{ guilds: Record<string, GuildOverviewEntry> }> {
  return apiFetch(`/api/guilds/overview`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// ── Emergency lockdown + verification gate ───────────────────────────────────

export interface LockdownStatus {
  active: boolean;
  since: number;
  by: string | null;
  reason: string | null;
  channelsLimited: number;
}

export async function getLockdown(guildId: string): Promise<LockdownStatus> {
  return apiFetch(`/api/guild/${guildId}/lockdown`);
}

export async function setLockdown(guildId: string, active: boolean, reason?: string): Promise<LockdownStatus & { steps?: { slowmode: number; invites: boolean; links: boolean } }> {
  // Locking down edits dozens of channels sequentially — give it time.
  return apiFetch(`/api/guild/${guildId}/lockdown`, {
    method: "POST",
    body: JSON.stringify({ active, reason: reason ?? null }),
  }, 180_000);
}

export interface PermFailure {
  feature: string;    // "Scam Shield" | "Raid Shield" | "Warn escalation"
  action: string;     // "ban" | "kick" | "timeout"
  userId: string;
  username: string;
  reasons: string[];
  ts: number;
}

/** Message Studio: have the bot DM the acting user a test render of a template. */
export async function sendTestMessage(guildId: string, kind: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/guild/${guildId}/messages/test`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

export async function getPermFails(guildId: string): Promise<{ items: PermFailure[]; dismissedAt: number }> {
  return apiFetch(`/api/guild/${guildId}/permfails`);
}

export async function dismissPermFails(guildId: string): Promise<{ ok: boolean; dismissedAt: number }> {
  return apiFetch(`/api/guild/${guildId}/permfails/dismiss`, { method: "POST" });
}

export interface VerifyHealthCheck { id: string; ok: boolean; label: string; detail: string; }
export interface VerifyHealth { ok: boolean; checks: VerifyHealthCheck[]; }

export async function getVerifyHealth(guildId: string): Promise<VerifyHealth> {
  return apiFetch(`/api/guild/${guildId}/verify/health`);
}

export async function getVerifyStats(guildId: string): Promise<{ total: number; last7: number }> {
  return apiFetch(`/api/guild/${guildId}/verify/stats`);
}

export interface VerifyPublicConfig {
  enabled: boolean;
  guildId: string;
  name: string | null;
  icon: string | null;
  minAccountAgeDays: number;
  page: { headline: string; message: string; accent: string };
  background: boolean;
  backgroundVersion: number;
}

export async function getVerifyPublic(guildId: string): Promise<VerifyPublicConfig> {
  return apiFetch(`/api/guild/${guildId}/verify/public`);
}

export async function completeVerify(guildId: string, userId: string): Promise<{ ok: boolean; error?: string; detail?: string }> {
  return apiFetch(`/api/guild/${guildId}/verify/complete`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export interface VerifySetupResult {
  ok: boolean;
  roleId: string;
  roleName: string;
  roleCreated: boolean;
  channelsLocked: number;
  channelsSkipped: number;
  channelsFailed: number;
  infoChannel: "created" | "existing" | null;
}

export async function setupVerifyRole(guildId: string): Promise<VerifySetupResult> {
  // Locks every channel one by one — give it time on big servers.
  return apiFetch(`/api/guild/${guildId}/verify/setup-role`, {
    method: "POST",
    body: JSON.stringify({}),
  }, 180_000);
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
  /** Deep check (checker page) only: resolved redirect hops after the submitted URL. */
  redirects?: { url: string; domain: string; status: number }[];
  finalUrl?: string;
  finalDomain?: string;
}

export async function checkLink(url: string): Promise<LinkVerdict> {
  return apiFetch<LinkVerdict>(`/api/check?url=${encodeURIComponent(url)}`);
}

// ── User reports (→ operator admin panel) ──────────────────────────────────────

export type ReportType = "malicious_link" | "false_positive" | "bug" | "feedback" | "appeal";

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

// ── Scam Shield appeals (unban requests) ─────────────────────────────────────

export interface AppealStatus {
  flagged: boolean;
  flag: { reason: string; incidents: number; guilds: number; lastSeen: number } | null;
  appeal: { id: number; status: Report["status"]; message: string | null; createdAt: number } | null;
}

export async function getAppealStatus(): Promise<AppealStatus> {
  return apiFetch(`/api/appeal/status`);
}

export async function submitAppeal(message: string): Promise<{ id: number; existing?: boolean }> {
  return apiFetch(`/api/appeal`, { method: "POST", body: JSON.stringify({ message }) });
}

export async function decideAppeal(id: number, accept: boolean): Promise<void> {
  await apiFetch(`/api/admin/appeals/${id}/decide`, { method: "POST", body: JSON.stringify({ accept }) });
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
  type: "report_new" | "report_reply" | "report_status" | "settings" | "warn" | "dev_request" | "dev_decision";
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
  streak: number;      // live consecutive-day vote streak (0 when lapsed)
}

export interface SupporterWallEntry {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  votes: number;
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
  streak: number;      // live consecutive-day vote streak (0 when lapsed)
  bestStreak: number;
}

export interface UserFlags {
  tourSeen: boolean;
  votePromptSeen: boolean;
}

export async function getLeaderboard(limit = 10): Promise<{ month: string; leaderboard: LeaderboardEntry[] }> {
  return apiFetch(`/api/leaderboard?limit=${limit}`);
}

export async function getSupporters(): Promise<{ month: string; count: number; supporters: SupporterWallEntry[] }> {
  return apiFetch(`/api/supporters`);
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

// ── Developer access (apply in Settings → approve in the admin panel) ────────

export interface DevStatus {
  status: "none" | "pending" | "approved" | "denied";
  message: string | null;
  requestedAt: number;
  decidedAt: number;
  beta: boolean;
}

export interface DevRequestEntry extends DevStatus {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
}

export async function getDevStatus(userId: string): Promise<DevStatus> {
  return apiFetch(`/api/user/${userId}/dev`);
}

export async function requestDevAccess(userId: string, message?: string): Promise<DevStatus> {
  return apiFetch(`/api/user/${userId}/dev/request`, {
    method: "POST",
    body: JSON.stringify({ message: message ?? null }),
  });
}

export async function getDevRequests(): Promise<{ requests: DevRequestEntry[] }> {
  return apiFetch(`/api/admin/dev/requests`);
}

export async function decideDevRequest(userId: string, accept: boolean): Promise<void> {
  await apiFetch(`/api/admin/dev/requests/${userId}/decide`, {
    method: "POST",
    body: JSON.stringify({ accept }),
  });
}

export async function setDevBeta(userId: string, enabled: boolean): Promise<DevStatus> {
  return apiFetch(`/api/user/${userId}/dev/beta`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

// ── Developer platform: per-server API keys + webhooks ───────────────────────

export type DevKeyScope = "read" | "moderate" | "config";

export interface DevKey {
  id: number;
  label: string | null;
  prefix: string;
  createdAt: number;
  lastUsed: number;
  totalRequests: number;
  /** Granted scopes — 'read' is always included server-side. */
  scopes: DevKeyScope[];
  /** Present only in the create response — shown once, never stored. */
  key?: string;
}

export type WebhookEvent =
  | "link_blocked" | "member_kicked" | "member_banned"
  | "member_timeout" | "scamshield_catch" | "raid_detected";

export interface DevWebhook {
  id: number;
  url: string;
  secret: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: number;
  lastStatus: number | null;
  lastDeliveryAt: number;
  failureCount: number;
}

export async function listDevKeys(guildId: string): Promise<{ keys: DevKey[] }> {
  return apiFetch(`/api/guild/${guildId}/dev/keys`);
}

export async function createDevKey(guildId: string, label?: string, scopes?: DevKeyScope[]): Promise<DevKey> {
  return apiFetch(`/api/guild/${guildId}/dev/keys`, {
    method: "POST",
    body: JSON.stringify({ label: label ?? null, scopes: scopes ?? ["read"] }),
  });
}

export async function revokeDevKey(guildId: string, keyId: number): Promise<void> {
  await apiFetch(`/api/guild/${guildId}/dev/keys/${keyId}`, { method: "DELETE" });
}

export async function listDevWebhooks(guildId: string): Promise<{ webhooks: DevWebhook[]; events: WebhookEvent[] }> {
  return apiFetch(`/api/guild/${guildId}/dev/webhooks`);
}

export async function createDevWebhook(guildId: string, url: string, events: WebhookEvent[]): Promise<DevWebhook> {
  return apiFetch(`/api/guild/${guildId}/dev/webhooks`, {
    method: "POST",
    body: JSON.stringify({ url, events }),
  });
}

export async function patchDevWebhook(
  guildId: string,
  webhookId: number,
  body: { url?: string; events?: WebhookEvent[]; enabled?: boolean }
): Promise<DevWebhook> {
  return apiFetch(`/api/guild/${guildId}/dev/webhooks/${webhookId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteDevWebhook(guildId: string, webhookId: number): Promise<void> {
  await apiFetch(`/api/guild/${guildId}/dev/webhooks/${webhookId}`, { method: "DELETE" });
}

export async function testDevWebhook(
  guildId: string,
  webhookId: number,
  event?: WebhookEvent | "test"
): Promise<{ ok: boolean; status: number; durationMs: number; event: string }> {
  return apiFetch(`/api/guild/${guildId}/dev/webhooks/${webhookId}/test`, {
    method: "POST",
    body: JSON.stringify({ event: event ?? "test" }),
  });
}

// ── Webhook delivery log (last 50, newest first) ─────────────────────────────

export interface WebhookDelivery {
  id: number;
  event: string;
  /** Upstream HTTP status; 0 = network error / endpoint unreachable. */
  status: number;
  ok: boolean;
  durationMs: number;
  createdAt: number;
}

export async function getDevWebhookDeliveries(
  guildId: string,
  webhookId: number
): Promise<{ deliveries: WebhookDelivery[] }> {
  return apiFetch(`/api/guild/${guildId}/dev/webhooks/${webhookId}/deliveries`);
}

export async function setUserFlags(
  userId: string,
  body: { tourSeen?: boolean; votePromptSeen?: boolean }
): Promise<UserFlags> {
  return apiFetch(`/api/user/${userId}/flags`, { method: "POST", body: JSON.stringify(body) });
}
