'use client';

import { AlertTriangle } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="dot-grid" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 20, background: 'rgba(240,178,50,0.1)', border: '1px solid rgba(240,178,50,0.3)', marginBottom: 24 }}>
          <AlertTriangle size={32} color="#f0b232" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f2f3f5' }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: '#949ba4', marginTop: 8, lineHeight: 1.6 }}>
          An unexpected error occurred while rendering this page. Trying again usually fixes it.
          {error.digest && <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#52535a', fontFamily: 'monospace' }}>Ref: {error.digest}</span>}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26 }}>
          <button onClick={reset} className="btn-primary btn-sm">Try again</button>
          <a href="/" className="btn-secondary btn-sm">Back to home</a>
        </div>
      </div>
    </div>
  );
}
