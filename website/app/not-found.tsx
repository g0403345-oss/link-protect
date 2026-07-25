import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="dot-grid" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 20, background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.25)', marginBottom: 24 }}>
          <ShieldOff size={32} color="#5865f2" />
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: '-0.03em', color: '#f2f3f5', lineHeight: 1 }}>404</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f2f3f5', marginTop: 14 }}>This page doesn&apos;t exist</h1>
        <p style={{ fontSize: 14, color: '#949ba4', marginTop: 8, lineHeight: 1.6 }}>
          The link you followed is broken or the page was moved. At least it wasn&apos;t a scam link — we would have blocked that.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26 }}>
          <Link href="/" className="btn-primary btn-sm">Back to home</Link>
          <Link href="/dashboard" className="btn-secondary btn-sm">Open dashboard</Link>
        </div>
      </div>
    </div>
  );
}
