'use client';

import { Gem } from 'lucide-react';

/** One shared lock note for every Premium extra: gem icon + one-line pitch +
 *  a real "Upgrade on the Overview tab" button. Keep it small and quiet —
 *  Premium is an offer, not a billboard, and protection itself always stays
 *  free. The button flags sessionStorage so PremiumCard auto-expands on the
 *  Overview; when the host can navigate it also jumps there directly. */
export default function PremiumLockNote({ text, onNavigate }: {
  text: string;
  /** Optional — when provided the button navigates to the Overview tab. */
  onNavigate?: (section: string) => void;
}) {
  const goUpgrade = () => {
    try { sessionStorage.setItem('lp_open_premium', '1'); } catch { /* ignore */ }
    onNavigate?.('overview');
  };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(88,101,242,0.05)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 8 }}>
      <Gem size={13} color="#96a4ff" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: '#949ba4', lineHeight: 1.55 }}>
        {text}{' '}
        <button onClick={goUpgrade}
          style={{ padding: 0, fontSize: 12, fontWeight: 600, color: '#96a4ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, fontFamily: 'inherit' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#b9c2ff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#96a4ff')}>
          Upgrade on the Overview tab
        </button>
      </p>
    </div>
  );
}
