/**
 * Link Protect JavaScript SDK (v0.1.0)
 * Docs: https://link-protect.com/developers · Try it with the key "lp_sandbox".
 */

const DEFAULT_BASE = 'https://link-protect.com';

export class LinkProtect {
  /** @param {string} apiKey lp_… key from the Developer tab (or "lp_sandbox") */
  constructor(apiKey, { baseUrl = DEFAULT_BASE } = {}) {
    if (!apiKey || !apiKey.startsWith('lp_')) throw new Error('LinkProtect: pass an lp_… API key');
    this.key = apiKey;
    this.base = baseUrl.replace(/\/$/, '');
  }

  async #req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'X-Api-Key': this.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.detail || data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ── read ── */
  stats() { return this.#req('GET', '/api/v1/stats'); }
  trends(days = 14) { return this.#req('GET', `/api/v1/trends?days=${days}`); }
  check(url, { deep = false } = {}) {
    return this.#req('GET', `/api/v1/check?url=${encodeURIComponent(url)}&deep=${deep ? 1 : 0}`);
  }
  checkBatch(urls) { return this.#req('POST', '/api/v1/check/batch', { urls }); }
  warns(userId) { return this.#req('GET', `/api/v1/warns/${userId}`); }

  /* ── write (key needs the matching scope) ── */
  moderate({ userId, action, reason, minutes }) {
    return this.#req('POST', '/api/v1/moderate', { userId, action, reason, minutes });
  }
  setBlocker(blocker, enabled) { return this.#req('POST', '/api/v1/blocker', { blocker, enabled }); }
  blacklist(action, link) { return this.#req('POST', '/api/v1/blacklist', { action, link }); }
  lockdown(active, reason) { return this.#req('POST', '/api/v1/lockdown', { active, reason }); }

  /**
   * Live moderation events (SSE). Returns a stop() function.
   * handler(eventName, data) is called per event.
   */
  streamEvents(handler) {
    const ctrl = new AbortController();
    (async () => {
      const res = await fetch(`${this.base}/api/v1/events/stream?key=${this.key}`, { signal: ctrl.signal });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          let ev = 'message', data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: ')) ev = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (data) { try { handler(ev, JSON.parse(data)); } catch { /* ignore */ } }
        }
      }
    })().catch(() => { /* stream closed */ });
    return () => ctrl.abort();
  }
}

/**
 * Verify a webhook's X-LinkProtect-Signature header (Node).
 * @param {string} secret  the webhook secret from the Developer tab
 * @param {string|Buffer} rawBody  the EXACT raw request body
 * @param {string} signatureHeader  e.g. "sha256=ab12…"
 */
export async function verifySignature(secret, rawBody, signatureHeader) {
  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signatureHeader || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

export default LinkProtect;
