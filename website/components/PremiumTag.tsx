import { Gem } from 'lucide-react';

/** Tiny "Premium" pill for card titles and field labels. Always visible —
 *  also with an active subscription — so the extras stay recognizable. */
export default function PremiumTag() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#96a4ff', background: 'rgba(88,101,242,0.14)', border: '1px solid rgba(88,101,242,0.3)', padding: '1px 7px', borderRadius: 99, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
      <Gem size={9} /> Premium
    </span>
  );
}
