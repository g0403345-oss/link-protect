'use client';

/**
 * Empty state with personality (redesign point 10): tinted icon ring, a line
 * of charm and an optional CTA — instead of a bare "No entries" string.
 */

import type { LucideIcon } from 'lucide-react';

export default function EmptyState({ icon: Icon, title, sub, color = '#5865f2', cta }: {
  icon: LucideIcon;
  title: string;
  sub?: string;
  color?: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ textAlign: 'center', padding: '36px 20px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 16, background: `${color}12`, border: `1px solid ${color}28`, marginBottom: 14 }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f2f3f5' }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: '#6d6f78', marginTop: 5, lineHeight: 1.55, maxWidth: 360, margin: '5px auto 0' }}>{sub}</div>}
      {cta && (
        <button onClick={cta.onClick} className="btn-secondary btn-sm" style={{ marginTop: 14, fontSize: 12.5 }}>
          {cta.label}
        </button>
      )}
    </div>
  );
}
