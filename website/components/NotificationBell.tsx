'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ShieldAlert, MessageSquare, Settings, Flag, CheckCheck, Code2 } from 'lucide-react';
import type { WebNotification } from '@/lib/db';
import ReportThread from '@/components/ReportThread';

const META: Record<string, { icon: typeof Bell; color: string }> = {
  report_new: { icon: Flag, color: '#eb459e' },
  report_reply: { icon: MessageSquare, color: '#5865f2' },
  report_status: { icon: MessageSquare, color: '#23a55a' },
  warn: { icon: ShieldAlert, color: '#f0b232' },
  settings: { icon: Settings, color: '#949ba4' },
  dev_request: { icon: Code2, color: '#f0b232' },
  dev_decision: { icon: Code2, color: '#23a55a' },
};

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

export default function NotificationBell({ isAdmin = false }: { isAdmin?: boolean }) {
  const [items, setItems] = useState<WebNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [openReport, setOpenReport] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const d = await res.json();
      setItems(d.notifications ?? []);
      setUnread(d.unread ?? 0);
    } catch { /* ignore */ }
  }, []);

  // Visibility-aware polling. The previous SSE stream held a Vercel function
  // open for every signed-in tab around the clock — that alone burned ~280
  // GB-hrs/month of Fluid provisioned memory. A 60s poll (paused in background
  // tabs, instant refresh on focus) costs a fraction of a percent of that and
  // is plenty for ticket notifications.
  useEffect(() => {
    fetchNotifs(); // instant first paint
    const tick = () => { if (document.visibilityState === 'visible') fetchNotifs(); };
    const interval = window.setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchNotifs(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [fetchNotifs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markSeen = useCallback(async () => {
    if (unread === 0) return;
    setUnread(0);
    try { await fetch('/api/notifications/seen', { method: 'POST' }); } catch { /* ignore */ }
  }, [unread]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markSeen();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={toggle} aria-label="Notifications" title="Notifications"
        style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: open ? '#18181b' : 'transparent', border: '1px solid ' + (open ? '#2e2e36' : 'transparent'), color: '#949ba4' }}>
        <Bell size={18} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, background: '#f23f43', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0a0a0c' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 44, width: 340, maxWidth: 'calc(100vw - 24px)', background: '#111113', border: '1px solid #2e2e36', borderRadius: 12, boxShadow: '0 20px 48px rgba(0,0,0,0.5)', zIndex: 300, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#f2f3f5' }}>Notifications</span>
            <button onClick={markSeen} title="Mark all read"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#949ba4', background: 'none', border: 'none', cursor: 'pointer' }}>
              <CheckCheck size={13} /> Mark read
            </button>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <Bell size={24} color="#2e2e36" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, color: '#52535a' }}>You’re all caught up</p>
              </div>
            ) : (
              items.map((n) => {
                const m = META[n.type] ?? META.settings;
                const clickable = !!n.reportId;
                return (
                  <button key={n.id} disabled={!clickable}
                    onClick={() => { if (n.reportId) { setOpenReport(n.reportId); setOpen(false); } }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 10, padding: '11px 14px', border: 'none', borderBottom: '1px solid #161619', cursor: clickable ? 'pointer' : 'default', background: n.unread ? 'rgba(88,101,242,0.06)' : 'transparent' }}>
                    <span style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, background: `${m.color}1a`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <m.icon size={15} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#f2f3f5' }}>{n.title}</span>
                      {n.body && <span style={{ display: 'block', fontSize: 11.5, color: '#949ba4', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</span>}
                    </span>
                    <span style={{ flex: 'none', fontSize: 10.5, color: '#52535a' }}>{relTime(n.createdAt)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {openReport !== null && (
        <ReportThread reportId={openReport} viewerIsAdmin={isAdmin}
          onClose={() => setOpenReport(null)} onChanged={fetchNotifs} />
      )}
    </div>
  );
}
