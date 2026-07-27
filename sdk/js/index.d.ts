export interface CheckResult {
  url: string; domain?: string; safe?: boolean; category?: string | null;
  source?: string; reason?: string; seenOnServers?: number; hits?: number; error?: string;
}

export class LinkProtect {
  constructor(apiKey: string, opts?: { baseUrl?: string });
  stats(): Promise<Record<string, unknown>>;
  trends(days?: number): Promise<Record<string, unknown>>;
  check(url: string, opts?: { deep?: boolean }): Promise<CheckResult>;
  checkBatch(urls: string[]): Promise<{ count: number; results: CheckResult[] }>;
  warns(userId: string): Promise<{ userId: string; warnings: number; reasons: string[]; timestamps: number[] }>;
  moderate(opts: { userId: string; action: 'warn' | 'timeout' | 'untimeout' | 'kick' | 'ban' | 'unban'; reason?: string; minutes?: number }): Promise<Record<string, unknown>>;
  setBlocker(blocker: string, enabled: boolean): Promise<{ ok: boolean }>;
  blacklist(action: 'add' | 'remove', link: string): Promise<{ ok: boolean; links: string[] }>;
  lockdown(active: boolean, reason?: string): Promise<Record<string, unknown>>;
  streamEvents(handler: (event: string, data: Record<string, unknown>) => void): () => void;
}

export function verifySignature(secret: string, rawBody: string | Uint8Array, signatureHeader: string): Promise<boolean>;
export default LinkProtect;
