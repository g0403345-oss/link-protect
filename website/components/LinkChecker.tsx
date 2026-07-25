'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, Search, Loader2, Globe, CornerDownRight, Link2, Check, Info } from 'lucide-react';
import type { LinkVerdict } from '@/lib/db';

const CAT_COLOR: Record<string, string> = {
  malware: '#f23f43', phishing: '#eb459e', scam: '#f0b232', nitro: '#eb459e',
};

// "Why is this dangerous" — shown on the /check page (detailed mode) only.
const CAT_EXPLAIN: Record<string, string> = {
  phishing: 'Phishing pages imitate a real login screen (Discord, Steam, banks …) to steal your password the moment you type it. Never enter credentials on this site — if you already did, change that password immediately and enable 2FA.',
  nitro: '“Free Nitro” pages are account-hijack bait: they ask you to log in or grab your Discord token, then the attacker takes over your account and spams your servers. Discord never gives away Nitro on third-party sites.',
  scam: 'Scam sites imitate shops, giveaways or trading offers to take your money or account items. Anything you pay or trade there is gone — there is no real product behind it.',
  malware: 'This link delivers malicious software — for example a disguised download or a drive-by exploit. Opening it can infect your device and steal saved passwords, tokens and files. Don’t download or run anything from it.',
};

const SCAN_PHASES = [
  'Checking the Link Protect threat database…',
  'Following the redirect chain…',
  'Consulting Google Safe Browsing…',
  'Compiling the verdict…',
];

export default function LinkChecker({ compact = false, detailed = false, initialUrl = '' }: {
  compact?: boolean;
  /** Checker-page mode: deep redirect resolution, explanation + share link. */
  detailed?: boolean;
  initialUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<LinkVerdict | null>(null);
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState(0);
  const autoRan = useRef(false);

  // Scan-phase ticker: advances the status line while a check is running.
  useEffect(() => {
    if (!loading) { setPhase(0); return; }
    const id = setInterval(() => {
      setPhase((p) => Math.min(p + 1, SCAN_PHASES.length - 1));
    }, detailed ? 650 : 400);
    return () => clearInterval(id);
  }, [loading, detailed]);

  const check = useCallback(async (value?: string) => {
    const v = (value ?? url).trim();
    if (!v || loading) return;
    setLoading(true); setError(null); setVerdict(null); setCopied(false);
    try {
      const res = await fetch(`/api/check?url=${encodeURIComponent(v)}${detailed ? '&deep=1' : ''}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Could not check that link.'); }
      else { setVerdict(d as LinkVerdict); }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, [url, loading, detailed]);

  // Shared result links (/check?url=…) run the check automatically.
  useEffect(() => {
    if (detailed && initialUrl && !autoRan.current) {
      autoRan.current = true;
      check(initialUrl);
    }
  }, [detailed, initialUrl, check]);

  const copyShareLink = async () => {
    if (!verdict) return;
    const link = `${window.location.origin}/check?url=${encodeURIComponent(verdict.url)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — ignore */ }
  };

  const unsafe = verdict && !verdict.safe;
  const col = unsafe ? (CAT_COLOR[verdict!.category ?? ''] ?? '#f23f43') : '#23a55a';
  const explain = unsafe ? CAT_EXPLAIN[verdict!.category ?? ''] ?? CAT_EXPLAIN.malware : null;
  const hops = verdict?.redirects ?? [];

  return (
    <div style={{ width: '100%', maxWidth: compact ? '100%' : 560 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, borderRadius: 10, overflow: 'hidden' }}>
          <Search size={15} color="#52535a" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 2 }} />
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') check(); }}
            placeholder="Paste a link, e.g. discord-nitro.ru"
            style={{ width: '100%', padding: '13px 14px 13px 38px', fontSize: 14, background: '#18181b', border: `1px solid ${loading ? '#5865f2' : '#2e2e36'}`, borderRadius: 10, color: loading ? '#949ba4' : '#f2f3f5', outline: 'none', fontFamily: 'inherit', transition: 'color 0.2s' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')}
            onBlur={(e) => { if (!loading) e.currentTarget.style.borderColor = '#2e2e36'; }}
          />
          {/* Scan beam sweeping across the input while checking */}
          {loading && (
            <div aria-hidden style={{ position: 'absolute', inset: 1, borderRadius: 9, pointerEvents: 'none', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, width: 90, background: 'linear-gradient(90deg, transparent, rgba(88,101,242,0.28), rgba(127,216,255,0.34), rgba(88,101,242,0.28), transparent)', animation: 'lpScanBeam 1.1s linear infinite', filter: 'blur(1px)' }} />
            </div>
          )}
        </div>
        <button onClick={() => check()} disabled={loading || !url.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 20px', fontSize: 14, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', opacity: loading || !url.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={15} />}
          {loading ? 'Scanning' : 'Check'}
        </button>
      </div>

      {loading && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5865f2', animation: 'lpScanPulse 0.9s ease-in-out infinite', flexShrink: 0 }} />
          <span key={phase} style={{ fontSize: 12, color: '#949ba4', animation: 'lpHopIn 0.3s both' }}>
            {detailed ? SCAN_PHASES[phase] : 'Scanning link…'}
          </span>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 10, fontSize: 13, color: '#f23f43' }}>
          {error}
        </div>
      )}

      {verdict && (
        <div style={{ marginTop: 12, padding: '16px 18px', background: '#111113', border: `1px solid ${col}44`, borderRadius: 12, textAlign: 'left', animation: 'lpVerdictIn 0.35s cubic-bezier(0.2, 0.9, 0.3, 1) both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${col}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {unsafe ? <ShieldAlert size={18} color={col} /> : <ShieldCheck size={18} color={col} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: col, letterSpacing: '-0.01em' }}>
                {unsafe ? 'Dangerous link' : 'No threat found'}
                {unsafe && verdict.category ? ` · ${verdict.category}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#6d6f78', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {verdict.domain}
              </div>
            </div>
            {detailed && (
              <button onClick={copyShareLink} title="Copy a link to this result"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: copied ? '#23a55a' : '#949ba4', background: '#18181b', border: `1px solid ${copied ? 'rgba(35,165,90,0.4)' : '#2e2e36'}`, borderRadius: 8, cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s' }}>
                {copied ? <Check size={13} /> : <Link2 size={13} />}
                {copied ? 'Copied!' : 'Share result'}
              </button>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#949ba4', lineHeight: 1.55 }}>{verdict.reason}</p>

          {/* Redirect chain — deep check only */}
          {detailed && hops.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Redirect chain · {hops.length} hop{hops.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#949ba4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {verdict.domain}
                </div>
                {hops.map((h, i) => {
                  const last = i === hops.length - 1;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: (i + 1) * 12, animation: 'lpHopIn 0.4s both', animationDelay: `${0.25 + i * 0.3}s` }}>
                      <CornerDownRight size={12} color="#52535a" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: last && unsafe ? col : last ? '#f2f3f5' : '#949ba4', fontWeight: last ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: last && unsafe ? `0 0 12px ${col}66` : 'none' }}>
                        {h.domain}
                      </span>
                      <span style={{ fontSize: 10, color: '#52535a', flexShrink: 0 }}>{h.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {detailed && verdict.safe && hops.length === 0 && verdict.redirects !== undefined && (
            <p style={{ marginTop: 8, fontSize: 11, color: '#52535a' }}>No redirects — the link goes straight to {verdict.domain}.</p>
          )}

          {/* Why this is dangerous — deep check only */}
          {detailed && explain && (
            <div style={{ marginTop: 12, display: 'flex', gap: 9, padding: '11px 13px', background: `${col}0d`, border: `1px solid ${col}30`, borderRadius: 8 }}>
              <Info size={14} color={col} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: col, marginBottom: 3 }}>Why this is dangerous</div>
                <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.55 }}>{explain}</p>
              </div>
            </div>
          )}

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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes lpScanBeam { from { left: -90px; } to { left: 100%; } }
        @keyframes lpScanPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
        @keyframes lpHopIn { from { opacity: 0; transform: translateX(-7px); } to { opacity: 1; transform: none; } }
        @keyframes lpVerdictIn { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
