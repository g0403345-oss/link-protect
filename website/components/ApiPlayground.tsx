'use client';

import { useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';

const C = {
  bg: '#111113', border: '#1e1e22', text: '#f2f3f5', muted: '#6d6f78',
  dim: '#52535a', accent: '#5865f2', code: '#949ba4',
};

interface Endpoint {
  id: string;
  method: 'GET' | 'POST';
  /** Display path — {userId} is filled from the params JSON. */
  path: string;
  scope: 'read' | 'moderate' | 'config';
  desc: string;
  params: Record<string, unknown>;
}

const ENDPOINTS: Endpoint[] = [
  { id: 'stats', method: 'GET', path: '/api/v1/stats', scope: 'read', desc: 'Live protection stats', params: {} },
  { id: 'trends', method: 'GET', path: '/api/v1/trends', scope: 'read', desc: 'Daily action counts', params: { days: 7 } },
  { id: 'check', method: 'GET', path: '/api/v1/check', scope: 'read', desc: 'Threat lookup for one URL', params: { url: 'bit.ly/abc123', deep: 1 } },
  { id: 'check-batch', method: 'POST', path: '/api/v1/check/batch', scope: 'read', desc: 'Check up to 25 URLs at once', params: { urls: ['bit.ly/abc123', 'https://example.com'] } },
  { id: 'warns', method: 'GET', path: '/api/v1/warns/{userId}', scope: 'read', desc: 'Warning record of a member', params: { userId: '9876543210' } },
  { id: 'moderate', method: 'POST', path: '/api/v1/moderate', scope: 'moderate', desc: 'Warn / timeout / kick / ban', params: { userId: '9876543210', action: 'warn', reason: 'Playground test' } },
  { id: 'blocker', method: 'POST', path: '/api/v1/blocker', scope: 'config', desc: 'Toggle a link blocker', params: { blocker: 'nitro', enabled: true } },
  { id: 'blacklist', method: 'POST', path: '/api/v1/blacklist', scope: 'config', desc: 'Edit the custom blacklist', params: { action: 'add', link: 'scam-site.ru' } },
  { id: 'lockdown', method: 'POST', path: '/api/v1/lockdown', scope: 'config', desc: 'Toggle emergency lockdown', params: { active: false, reason: 'Playground test' } },
  { id: 'openapi', method: 'GET', path: '/api/v1/openapi.json', scope: 'read', desc: 'Machine-readable API spec', params: {} },
];

const SCOPE_COLORS: Record<Endpoint['scope'], string> = {
  read: '#949ba4', moderate: '#f0b232', config: '#23a55a',
};

export default function ApiPlayground() {
  const [epId, setEpId] = useState('stats');
  const [apiKey, setApiKey] = useState('lp_sandbox');
  const [bodyText, setBodyText] = useState('{}');
  const [sending, setSending] = useState(false);
  const [resp, setResp] = useState<{ status: number; label: string; body: string; ms: number } | null>(null);

  const ep = ENDPOINTS.find((e) => e.id === epId) ?? ENDPOINTS[0];

  const pickEndpoint = (id: string) => {
    setEpId(id);
    const next = ENDPOINTS.find((e) => e.id === id) ?? ENDPOINTS[0];
    setBodyText(Object.keys(next.params).length ? JSON.stringify(next.params, null, 2) : '{}');
    setResp(null);
  };

  const send = async () => {
    let parsed: Record<string, unknown> = {};
    if (bodyText.trim()) {
      try { parsed = JSON.parse(bodyText) as Record<string, unknown>; }
      catch { setResp({ status: 0, label: 'invalid JSON', body: 'The params/body field is not valid JSON.', ms: 0 }); return; }
    }
    let path = ep.path;
    if (path.includes('{userId}')) {
      path = path.replace('{userId}', encodeURIComponent(String(parsed.userId ?? '')));
      delete parsed.userId;
    }
    const headers: Record<string, string> = { 'X-Api-Key': apiKey.trim() };
    const init: RequestInit = { method: ep.method, headers };
    if (ep.method === 'GET') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
      }
      if (qs.toString()) path += `?${qs.toString()}`;
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(parsed);
    }
    setSending(true);
    const t0 = performance.now();
    try {
      const res = await fetch(path, init);
      const ms = Math.round(performance.now() - t0);
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* leave as-is */ }
      setResp({ status: res.status, label: `${res.status} ${res.statusText}`.trim(), body: pretty, ms });
    } catch {
      setResp({ status: 0, label: 'network error', body: 'The request did not reach the API.', ms: Math.round(performance.now() - t0) });
    } finally {
      setSending(false);
    }
  };

  const input = { padding: '8px 11px', fontSize: 12.5, background: C.bg, border: `1px solid #2e2e36`, borderRadius: 8, color: C.text, outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as const;
  const statusColor = resp == null ? C.dim
    : resp.status >= 200 && resp.status < 300 ? '#23a55a'
    : resp.status >= 400 && resp.status < 500 ? '#f0b232' : '#f23f43';

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, margin: '14px 0' }}>
      {/* Endpoint picker */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {ENDPOINTS.map((e) => {
          const on = e.id === epId;
          return (
            <button key={e.id} onClick={() => pickEndpoint(e.id)} title={e.desc}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', background: on ? 'rgba(88,101,242,0.15)' : '#18181b', color: on ? '#96a4ff' : C.muted, border: `1px solid ${on ? 'rgba(88,101,242,0.4)' : '#2e2e36'}`, fontFamily: 'ui-monospace, Menlo, monospace' }}>
              <span style={{ fontWeight: 800, fontSize: 10, color: e.method === 'GET' ? '#23a55a' : '#f0b232' }}>{e.method}</span>
              {e.path.replace('/api/v1/', '')}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 12.5, color: C.text, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          <b style={{ color: ep.method === 'GET' ? '#23a55a' : '#f0b232' }}>{ep.method}</b> {ep.path}
        </code>
        <span style={{ padding: '1px 8px', fontSize: 10, fontWeight: 700, color: SCOPE_COLORS[ep.scope], background: '#18181b', border: '1px solid #2e2e36', borderRadius: 99 }}>
          scope: {ep.scope}
        </span>
        <span style={{ fontSize: 11.5, color: C.dim }}>{ep.desc}</span>
      </div>

      {/* Key + params */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} spellCheck={false}
          placeholder="lp_sandbox" aria-label="API key" style={{ ...input, flex: '1 1 220px' }} />
        <button onClick={send} disabled={sending || !apiKey.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: sending || !apiKey.trim() ? 0.5 : 1 }}>
          {sending ? <RefreshCw size={13} style={{ animation: 'lp-play-spin 1s linear infinite' }} /> : <Play size={13} />} Send
        </button>
      </div>
      <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} spellCheck={false} rows={Math.min(10, Math.max(3, bodyText.split('\n').length))}
        aria-label={ep.method === 'GET' ? 'Query params (JSON)' : 'Request body (JSON)'}
        style={{ ...input, width: '100%', resize: 'vertical', lineHeight: 1.55, marginBottom: 4 }} />
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>
        {ep.method === 'GET'
          ? (ep.path.includes('{userId}') ? 'userId fills the path — other fields become query params.' : 'Fields are sent as query parameters.')
          : 'Sent verbatim as the JSON request body.'}
      </div>

      {/* Response */}
      {resp && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ padding: '2px 10px', fontSize: 11, fontWeight: 800, color: '#fff', background: statusColor, borderRadius: 99 }}>
              {resp.label}
            </span>
            <span style={{ fontSize: 11, color: C.dim }}>{resp.ms}ms</span>
          </div>
          <pre style={{ background: '#0c0c0e', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', fontSize: 12, lineHeight: 1.55, color: C.code, overflow: 'auto', maxHeight: 340, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre' }}>
            {resp.body}
          </pre>
        </div>
      )}
      <style>{`@keyframes lp-play-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
