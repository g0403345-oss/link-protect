'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, ShieldAlert, Globe, Server, Copy, Check, ScanSearch, Radar } from 'lucide-react';

interface BlockedLink {
  url: string; domain: string; category: string; source: string;
  hits: number; guildCount: number; firstSeen: number; lastSeen: number;
}
interface CategoryStat { category: string; count: number; hits: number; }
interface SeenDomain { domain: string; hits: number; lastSeen: number; }
interface ThreatData {
  summary: {
    uniqueUrls: number; uniqueDomains: number; totalHits: number; byCategory: CategoryStat[];
    seenDomains: number; seenHits: number; scannedUrls: number; maliciousFound: number;
    feedKnown: number; threatsTotal: number; caughtLive: number;
  };
  links: BlockedLink[];
  topDomains: SeenDomain[];
}

const SOURCE_LABEL: Record<string, string> = {
  blocked: 'blocked', scanned: 'scanned', feed: 'feed', caught: 'caught',
};

// Categories that are real threats (vs. server policy blocks like gif/youtube/invite).
const THREAT_CATEGORIES = ['malware', 'phishing', 'scam', 'nitro'];
const isThreat = (c: string) => THREAT_CATEGORIES.includes(c);

const CAT_COLOR: Record<string, string> = {
  malware: '#f23f43', nitro: '#eb459e', invite: '#5865f2', blacklist: '#f0b232',
  nsfw: '#ff73fa', shortener: '#00a8fc', gif: '#23a55a', youtube: '#ff4545',
  google: '#4285f4', twitch: '#9146ff', steam: '#66c0f4', link: '#949ba4',
};
const catColor = (c: string) => CAT_COLOR[c] ?? '#949ba4';

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const SORTS: { id: string; label: string }[] = [
  { id: 'hits', label: 'Most hits' },
  { id: 'guilds', label: 'Most servers' },
  { id: 'recent', label: 'Recently seen' },
];

export default function AdminThreatData() {
  const [data, setData] = useState<ThreatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('hits');
  const [copied, setCopied] = useState<string | null>(null);
  const [mode, setMode] = useState<'threats' | 'policy' | 'domains'>('threats');
  const [caughtOnly, setCaughtOnly] = useState(true);

  // Switching the view changes which categories are relevant — reset the chip.
  useEffect(() => { setCategory(''); }, [mode]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(() => {
    setLoading(true); setError(false);
    const params = new URLSearchParams();
    if (debounced) params.set('q', debounced);
    if (category) params.set('category', category);
    params.set('sort', sort);
    params.set('limit', '500');
    if (mode === 'threats') { params.set('kind', 'threats'); if (caughtOnly) params.set('caught', '1'); }
    else if (mode === 'policy') { params.set('kind', 'policy'); }
    fetch(`/api/admin/blocked-links?${params.toString()}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(true); } else { setData(d); } setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [debounced, category, sort, mode, caughtOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copy = (url: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(c => (c === url ? null : c)), 1500);
    }).catch(() => {});
  };

  const tiles = [
    { label: 'Caught on servers', value: data?.summary.caughtLive ?? 0, icon: Radar, color: '#f23f43',
      hint: 'Known-bad domains actually seen live on your servers — your own data' },
    { label: 'Malicious found (scan)', value: data?.summary.maliciousFound ?? 0, icon: ScanSearch, color: '#eb459e',
      hint: 'New URLs your bot flagged via Safe Browsing' },
    { label: 'Known bad (feed)', value: data?.summary.feedKnown ?? 0, icon: ShieldAlert, color: '#6d6f78',
      hint: 'Imported public reference lists — not your own data' },
    { label: 'Domains seen', value: data?.summary.seenDomains ?? 0, icon: Globe, color: '#5865f2',
      hint: 'Distinct domains the bot has observed' },
    { label: 'Links seen', value: data?.summary.seenHits ?? 0, icon: Server, color: '#23a55a',
      hint: 'Total links observed across all servers' },
  ];

  return (
    <div>
      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        {tiles.map(t => (
          <div key={t.label} title={t.hint} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: `${t.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <t.icon size={13} style={{ color: t.color }} />
              </div>
              <span style={{ fontSize: 12, color: '#52535a', fontWeight: 500 }}>{t.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: t.color, letterSpacing: '-0.02em' }}>{t.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {([
          { id: 'threats', label: 'Threats', icon: ShieldAlert },
          { id: 'policy', label: 'Policy blocks', icon: Server },
          { id: 'domains', label: 'Circulating domains', icon: Radar },
        ] as const).map(m => {
          const active = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${active ? '#5865f2' : '#2e2e36'}`, background: active ? 'rgba(88,101,242,0.12)' : '#18181b', color: active ? '#96a4ff' : '#949ba4' }}>
              <m.icon size={13} /> {m.label}
            </button>
          );
        })}
        {mode === 'threats' && (
          <button onClick={() => setCaughtOnly(v => !v)}
            title="Only show threats actually seen live on your servers (your own data), hiding the imported feed you haven't encountered yet"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${caughtOnly ? '#23a55a' : '#2e2e36'}`, background: caughtOnly ? 'rgba(35,165,90,0.12)' : '#18181b', color: caughtOnly ? '#23a55a' : '#949ba4', marginLeft: 'auto' }}>
            <Radar size={13} /> {caughtOnly ? 'Caught on my servers' : 'Including feed (not yet seen)'}
          </button>
        )}
      </div>

      {/* Circulating domains (passive observation) */}
      {mode === 'domains' && (
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 8, padding: '10px 16px', borderBottom: '1px solid #1e1e22', fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Domain</span><span style={{ textAlign: 'right' }}>Seen</span><span style={{ textAlign: 'right' }}>Last seen</span>
          </div>
          {(data?.topDomains ?? []).length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#52535a' }}>No domains observed yet</div>
          ) : (data?.topDomains ?? []).map((d, i) => (
            <div key={d.domain} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 8, padding: '9px 16px', alignItems: 'center', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.012)', borderBottom: i < (data?.topDomains.length ?? 0) - 1 ? '1px solid #141416' : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.domain}</span>
              <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#f2f3f5' }}>{d.hits.toLocaleString()}</span>
              <span style={{ textAlign: 'right', fontSize: 11, color: '#52535a' }}>{relTime(d.lastSeen)}</span>
            </div>
          ))}
        </div>
      )}

      {mode !== 'domains' && (<>
      {/* Category filter chips (only the ones relevant to this view) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        <button onClick={() => setCategory('')}
          style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${category === '' ? '#5865f2' : '#2e2e36'}`, background: category === '' ? 'rgba(88,101,242,0.15)' : 'transparent', color: category === '' ? '#96a4ff' : '#949ba4' }}>
          All
        </button>
        {(data?.summary.byCategory ?? []).filter(c => mode === 'threats' ? isThreat(c.category) : !isThreat(c.category)).map(c => {
          const active = category === c.category;
          const col = catColor(c.category);
          return (
            <button key={c.category} onClick={() => setCategory(active ? '' : c.category)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${active ? col : '#2e2e36'}`, background: active ? `${col}1f` : 'transparent', color: active ? col : '#949ba4' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />
              {c.category}
              <span style={{ fontSize: 10, color: '#52535a' }}>{c.count}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} color="#52535a" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Search domain or URL…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }}
            onFocus={e => (e.currentTarget.style.borderColor = '#5865f2')}
            onBlur={e => (e.currentTarget.style.borderColor = '#2e2e36')} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {SORTS.map(s => (
            <button key={s.id} onClick={() => setSort(s.id)}
              style={{ fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${sort === s.id ? '#5865f2' : '#2e2e36'}`, background: sort === s.id ? 'rgba(88,101,242,0.12)' : '#18181b', color: sort === s.id ? '#96a4ff' : '#949ba4', whiteSpace: 'nowrap' }}>
              {s.label}
            </button>
          ))}
          <button onClick={fetchData} disabled={loading}
            style={{ width: 38, borderRadius: 8, background: '#18181b', border: '1px solid #2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color="#6d6f78" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '20px 24px', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.2)', borderRadius: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#f23f43', margin: 0 }}>Bot API unreachable</p>
          <p style={{ fontSize: 12, color: '#949ba4', margin: '4px 0 0' }}>
            The bot server isn&apos;t responding. Check that it&apos;s online — data reappears automatically once it&apos;s back.
          </p>
        </div>
      )}

      {/* Empty */}
      {!error && !loading && data && data.links.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <ShieldAlert size={32} color="#2e2e36" style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#949ba4', marginBottom: 4 }}>
            {mode === 'threats' && caughtOnly ? 'No known-bad links seen on your servers yet'
              : mode === 'threats' ? 'No threats recorded yet'
              : 'No policy blocks recorded yet'}
          </p>
          <p style={{ fontSize: 12, color: '#52535a' }}>
            {mode === 'threats' && caughtOnly
              ? `Matching live links against ${(data.summary.feedKnown ?? 0).toLocaleString()} known-bad domains — a hit appears here the moment someone posts one.`
              : 'Data fills in as the bot sees and blocks links across your servers.'}
          </p>
        </div>
      )}

      {/* Table */}
      {!error && data && data.links.length > 0 && (
        <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 80px 90px', gap: 8, padding: '10px 16px', borderBottom: '1px solid #1e1e22', fontSize: 11, fontWeight: 700, color: '#52535a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Link</span>
            <span>Category</span>
            <span style={{ textAlign: 'right' }}>Hits</span>
            <span style={{ textAlign: 'right' }}>Servers</span>
            <span style={{ textAlign: 'right' }}>Last seen</span>
          </div>
          {data.links.map((l, i) => {
            const col = catColor(l.category);
            return (
              <div key={l.url} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 80px 90px', gap: 8, padding: '10px 16px', alignItems: 'center', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.012)', borderBottom: i < data.links.length - 1 ? '1px solid #141416' : 'none' }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => copy(l.url)} title="Copy URL"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: copied === l.url ? '#23a55a' : '#52535a', flexShrink: 0, display: 'flex' }}>
                    {copied === l.url ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.domain}</div>
                    <div style={{ fontSize: 11, color: '#52535a', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</div>
                    {l.source && l.source !== 'blocked' && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: l.source === 'scanned' ? '#eb459e' : '#00a8fc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>via {SOURCE_LABEL[l.source] ?? l.source}</span>
                    )}
                  </div>
                </div>
                <span style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: col, background: `${col}1a`, border: `1px solid ${col}33`, padding: '2px 8px', borderRadius: 99 }}>
                  {l.category}
                </span>
                <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#f2f3f5' }}>{l.hits.toLocaleString()}</span>
                <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: l.guildCount > 1 ? '#f0b232' : '#6d6f78' }}>{l.guildCount.toLocaleString()}</span>
                <span style={{ textAlign: 'right', fontSize: 11, color: '#52535a' }}>{relTime(l.lastSeen)}</span>
              </div>
            );
          })}
        </div>
      )}

      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 52, background: '#18181b', border: '1px solid #1e1e22', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}
