'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, Check, Archive, ShieldPlus } from 'lucide-react';
import type { ReportThread as Thread, ReportMessage } from '@/lib/db';

const TYPE_LABEL: Record<string, string> = {
  malicious_link: 'Malicious link', false_positive: 'False positive', bug: 'Bug', feedback: 'Feedback',
};
const STATUS_COLOR: Record<string, string> = {
  open: '#f0b232', reviewed: '#5865f2', resolved: '#23a55a', dismissed: '#52535a',
};

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function ReportThread({
  reportId, viewerIsAdmin = false, onClose, onChanged,
}: {
  reportId: number;
  viewerIsAdmin?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/report/${reportId}`);
      if (!res.ok) { setError(res.status === 403 ? 'You can’t view this report.' : 'Could not load.'); return; }
      setThread(await res.json());
    } catch { setError('Network error.'); }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/report/${reportId}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }),
      });
      if (res.ok) { setThread(await res.json()); setText(''); onChanged?.(); }
    } finally { setSending(false); }
  };

  const setStatus = async (status: string, promote = false) => {
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, promote }),
      });
      if (res.ok) { await load(); onChanged?.(); }
    } finally { setStatusBusy(false); }
  };

  const r = thread?.report;
  const closed = !!r && (r.status === 'resolved' || r.status === 'dismissed');
  // "Mine" = messages I authored, shown on the right.
  const isMine = (m: ReportMessage) => (viewerIsAdmin ? m.sender === 'admin' : m.sender === 'user');

  const bubble = (mine: boolean): React.CSSProperties => ({
    alignSelf: mine ? 'flex-end' : 'flex-start',
    maxWidth: '82%', padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    background: mine ? '#5865f2' : '#25252e', color: mine ? '#fff' : '#ececf1',
    borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
  });

  return createPortal(
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
          onClick={(e) => e.stopPropagation()}
          style={{ background: '#111113', border: '1px solid #2e2e36', borderRadius: 14, width: '100%', maxWidth: 520, height: 'min(620px, 88vh)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
          {/* header */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#f2f3f5' }}>
                {r ? TYPE_LABEL[r.type] ?? 'Report' : 'Report'} <span style={{ color: '#52535a', fontWeight: 600 }}>#{reportId}</span>
              </div>
              {r && <div style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_COLOR[r.status] ?? '#52535a', textTransform: 'capitalize' }}>{r.status}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', display: 'flex' }}><X size={18} /></button>
          </div>

          {/* messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <p style={{ fontSize: 13, color: '#f87171' }}>{error}</p>}
            {!thread && !error && <p style={{ fontSize: 13, color: '#52535a' }}>Loading…</p>}
            {r && (
              <>
                {/* original report as the opening message (from the reporter) */}
                <div style={bubble(!viewerIsAdmin)}>
                  {r.url && <div style={{ fontFamily: 'monospace', fontSize: 12.5, marginBottom: r.message ? 6 : 0 }}>{r.url}</div>}
                  {r.message || (!r.url ? '(no details)' : '')}
                </div>
                <div style={{ alignSelf: !viewerIsAdmin ? 'flex-end' : 'flex-start', fontSize: 10.5, color: '#52535a', marginTop: -4 }}>
                  {viewerIsAdmin ? (r.username ?? `…${(r.userId ?? '').slice(-4)}`) : 'You'} · {relTime(r.createdAt)}
                </div>
                {thread!.messages.map((m) => (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={bubble(isMine(m))}>{m.body}</div>
                    <div style={{ alignSelf: isMine(m) ? 'flex-end' : 'flex-start', fontSize: 10.5, color: '#52535a', marginTop: 3 }}>
                      {isMine(m) ? 'You' : m.sender === 'admin' ? 'Support' : (m.username ?? 'User')} · {relTime(m.createdAt)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* admin quick actions */}
          {viewerIsAdmin && r && (
            <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderTop: '1px solid #1e1e22', flexWrap: 'wrap' }}>
              {r.type === 'malicious_link' && r.url && (
                <button onClick={() => setStatus('resolved', true)} disabled={statusBusy}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(242,63,67,0.4)', background: 'rgba(242,63,67,0.1)', color: '#f87171' }}>
                  <ShieldPlus size={13} /> Add to threat DB
                </button>
              )}
              <button onClick={() => setStatus('resolved')} disabled={statusBusy}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(35,165,90,0.4)', background: 'rgba(35,165,90,0.1)', color: '#23a55a' }}>
                <Check size={13} /> Resolve
              </button>
              <button onClick={() => setStatus('dismissed')} disabled={statusBusy}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid #2e2e36', background: '#18181b', color: '#949ba4' }}>
                <Archive size={13} /> Dismiss
              </button>
            </div>
          )}

          {/* reply box — closed tickets are read-only for the reporter */}
          {closed && !viewerIsAdmin ? (
            <div style={{ padding: '14px 16px', borderTop: '1px solid #1e1e22', fontSize: 12.5, color: '#6d6f78', textAlign: 'center' }}>
              This ticket was {r?.status} — you can no longer reply. Need more help? Open a new report.
            </div>
          ) : (
            <div style={{ padding: 12, borderTop: '1px solid #1e1e22', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={viewerIsAdmin ? (closed ? 'Reply (ticket is closed)…' : 'Reply to the reporter…') : 'Reply to support…'}
                style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '10px 12px', fontSize: 13.5, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 9, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')} onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
              <button onClick={send} disabled={sending || !text.trim()}
                style={{ width: 40, height: 40, flex: 'none', borderRadius: 9, background: '#5865f2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.55 : 1 }}>
                {sending ? <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} color="#fff" />}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AnimatePresence>,
    document.body,
  );
}
