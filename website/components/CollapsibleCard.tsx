'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** The one card chrome for every dashboard settings block: consistent header,
 *  and the whole card collapses via the header (state remembered per card in
 *  localStorage). No overflow:hidden — dropdowns must be able to escape. */
export default function CollapsibleCard({ title, children, tourId, right, storageKey, padded = true }: {
  title: React.ReactNode;
  children: React.ReactNode;
  /** data-tour anchor for the guided tour. */
  tourId?: string;
  /** Header controls (e.g. a range picker) — clicks there don't toggle. */
  right?: React.ReactNode;
  /** Persist the collapsed state under this key; omit for always-open cards. */
  storageKey?: string;
  padded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      if (localStorage.getItem(`lpcc_${storageKey}`) === '1') setCollapsed(true);
    } catch { /* ignore */ }
  }, [storageKey]);

  const toggle = () => {
    // Side effect outside the updater — updaters must stay pure.
    const next = !collapsed;
    setCollapsed(next);
    if (storageKey) {
      try { localStorage.setItem(`lpcc_${storageKey}`, next ? '1' : '0'); } catch { /* ignore */ }
    }
  };

  return (
    <div data-tour={tourId} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10 }}>
      {/* div, not <button> — header controls may contain their own buttons */}
      <div role="button" tabIndex={0} onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        title={collapsed ? 'Expand' : 'Collapse'}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: collapsed ? 'none' : '1px solid #1e1e22', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#949ba4', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {title}
        </span>
        {right && (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {right}
          </span>
        )}
        <ChevronDown size={14} color="#52535a"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }} />
      </div>
      {!collapsed && <div style={{ padding: padded ? 18 : 0 }}>{children}</div>}
    </div>
  );
}

/** Stable storage key from a card title — strips dynamic counts like "(3)". */
export function cardKey(prefix: string, title: string): string {
  return `${prefix}_${title.replace(/\s*\(.*\)\s*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
