'use client';

import { Gem } from 'lucide-react';

/** One shared lock note for every Premium extra: gem icon + one-line pitch +
 *  the standard "where to upgrade" hint. Keep it small and quiet — Premium is
 *  an offer, not a billboard, and protection itself always stays free. */
export default function PremiumLockNote({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(88,101,242,0.05)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 8 }}>
      <Gem size={13} color="#96a4ff" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: '#949ba4', lineHeight: 1.55 }}>
        {text} <span style={{ color: '#52535a' }}>Upgrade on the Overview tab.</span>
      </p>
    </div>
  );
}
