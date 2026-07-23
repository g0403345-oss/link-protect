'use client';

import { useState } from 'react';
import { Award, Check, Copy } from 'lucide-react';

// "Protected by Link Protect" embed card — shown on the guild dashboard
// overview so admins can put the live badge on their website or README.
export default function BadgeCard({ guildId }: { guildId: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const badgeUrl = `https://link-protect.com/api/badge?guild=${guildId}`;
  const snippets = [
    { key: 'markdown', label: 'Markdown', code: `[![Protected by Link Protect](${badgeUrl})](https://link-protect.com)` },
    { key: 'html', label: 'HTML', code: `<a href="https://link-protect.com"><img src="${badgeUrl}" alt="Protected by Link Protect"></a>` },
  ];

  const copy = async (key: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch { /* clipboard unavailable — ignore */ }
  };

  return (
    <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Award size={14} color="#5865f2" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>Protected-by Badge</span>
      </div>
      <div style={{ padding: 18 }}>
        <p style={{ fontSize: 12, color: '#6d6f78', marginBottom: 14, lineHeight: 1.55 }}>
          Show visitors your community is protected — embed this live badge on your website,
          GitHub README or forum signature. The counter updates automatically.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/badge?guild=${guildId}`} alt="Protected by Link Protect" height={28} style={{ marginBottom: 14, display: 'block' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {snippets.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#52535a', width: 66, flexShrink: 0 }}>{s.label}</span>
              <code style={{ flex: 1, fontSize: 11, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, padding: '7px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {s.code}
              </code>
              <button onClick={() => copy(s.key, s.code)} title={`Copy ${s.label} snippet`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', fontSize: 11, fontWeight: 600, color: copied === s.key ? '#23a55a' : '#949ba4', background: '#18181b', border: `1px solid ${copied === s.key ? 'rgba(35,165,90,0.4)' : '#2e2e36'}`, borderRadius: 7, cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s' }}>
                {copied === s.key ? <Check size={12} /> : <Copy size={12} />}
                {copied === s.key ? 'Copied' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
