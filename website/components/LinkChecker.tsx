'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Search, Loader2, Globe } from 'lucide-react';
import type { LinkVerdict } from '@/lib/db';

const CAT_COLOR: Record<string, string> = {
  malware: '#f23f43', phishing: '#eb459e', scam: '#f0b232', nitro: '#eb459e',
};

export default function LinkChecker({ compact = false }: { compact?: boolean }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<LinkVerdict | null>(null);

  const check = async () => {
    const v = url.trim();
    if (!v || loading) return;
    setLoading(true); setError(null); setVerdict(null);
    try {
      const res = await fetch(`/api/check?url=${encodeURIComponent(v)}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Could not check that link.'); }
      else { setVerdict(d as LinkVerdict); }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const unsafe = verdict && !verdict.safe;
  const col = unsafe ? (CAT_COLOR[verdict!.category ?? ''] ?? '#f23f43') : '#23a55a';

  return (
    <div style={{ width: '100%', maxWidth: compact ? '100%' : 560 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} color="#52535a" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') check(); }}
            placeholder="Paste a link, e.g. discord-nitro.ru"
            style={{ width: '100%', padding: '13px 14px 13px 38px', fontSize: 14, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')}
          />
        </div>
        <button onClick={check} disabled={loading || !url.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 20px', fontSize: 14, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', opacity: loading || !url.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={15} />}
          Check
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 10, fontSize: 13, color: '#f87171' }}>
          {error}
        </div>
      )}

      {verdict && (
        <div style={{ marginTop: 12, padding: '16px 18px', background: '#111113', border: `1px solid ${col}44`, borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${col}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {unsafe ? <ShieldAlert size={18} color={col} /> : <ShieldCheck size={18} color={col} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: col, letterSpacing: '-0.01em' }}>
                {unsafe ? 'Dangerous link' : 'No threat found'}
                {unsafe && verdict.category ? ` · ${verdict.category}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#6d6f78', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {verdict.domain}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.55 }}>{verdict.reason}</p>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
            {verdict.seenOnServers > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#f0b232' }}>
                <Globe size={12} /> Seen on {verdict.seenOnServers.toLocaleString()} server{verdict.seenOnServers === 1 ? '' : 's'}
              </span>
            )}
            <span style={{ fontSize: 11, color: '#52535a' }}>
              source: {verdict.source === 'threat-db' ? 'Link Protect threat DB' : verdict.source === 'safe-browsing' ? 'Google Safe Browsing' : 'no record'}
            </span>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
