'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, ShieldAlert, MessageSquare, Settings, Flag, CheckCheck, Code2,
  ChevronDown, ArrowRight,
} from 'lucide-react';
import type { WebNotification } from '@/lib/db';
import ReportThread from '@/components/ReportThread';

const META: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  report_new: { icon: Flag, color: '#eb459e', label: 'Report' },
  report_reply: { icon: MessageSquare, color: '#5865f2', label: 'Reply' },
  report_status: { icon: MessageSquare, color: '#23a55a', label: 'Status' },
  warn: { icon: ShieldAlert, color: '#f0b232', label: 'Warning' },
  settings: { icon: Settings, color: '#949ba4', label: 'Settings' },
  dev_request: { icon: Code2, color: '#f0b232', label: 'Developer' },
  dev_decision: { icon: Code2, color: '#23a55a', label: 'Developer' },
};

function relTime(ts: number) {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

/** Where a notification can take you (besides expanding in place). */
function actionFor(n: WebNotification, isAdmin: boolean): { label: string; href?: string; report?: boolean } | null {
  if (n.reportId) return { label: n.type === 'report_new' ? 'Open report' : 'Open conversation', report: true };
  if (n.type === 'dev_request' && isAdmin) return { label: 'Review in admin panel', href: '/dashboard/admin' };
  if (n.type === 'dev_decision') return { label: 'Open your dashboard', href: '/dashboard' };
  if (n.type === 'settings' || n.type === 'warn') return { label: 'Open dashboard', href: '/dashboard' };
  return null;
}

export default function NotificationBell({ isAdmin = false }: { isAdmin?: boolean }) {
  const [items, setItems] = useState<WebNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [openReport, setOpenReport] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runAction = (n: WebNotification) => {
    const a = actionFor(n, isAdmin);
    if (!a) return;
    if (a.report && n.reportId) { setOpenReport(n.reportId); setOpen(false); return; }
    if (a.href) { setOpen(false); router.push(a.href); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={toggle} aria-label="Notifications" title="Notifications"
        style={{ position: 'relative', width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: open ? '#18181b' : 'transparent', border: '1px solid ' + (open ? '#2e2e36' : 'transparent'), color: open ? '#f2f3f5' : '#949ba4', transition: 'color 0.15s' }}>
        <Bell size={18} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, background: '#f23f43', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0a0a0c' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 44, width: 384, maxWidth: 'calc(100vw - 24px)', background: 'rgba(17,17,19,0.97)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid #2e2e36', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.55)', zIndex: 300, overflow: 'hidden', animation: 'lp-bell-in 0.16s cubic-bezier(0.22,1,0.36,1)' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#f2f3f5' }}>Notifications</span>
            {items.some((n) => n.unread) && (
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: 'rgba(88,101,242,0.15)', color: '#96a4ff' }}>
                {items.filter((n) => n.unread).length} new
              </span>
            )}
            <button onClick={markSeen} title="Mark all read"
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#949ba4', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f2f3f5')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#949ba4')}>
              <CheckCheck size={13} /> Mark read
            </button>
          </div>

          <div style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
            {items.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 14, background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <Bell size={19} color="#5865f2" />
                </span>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5' }}>You’re all caught up</p>
                <p style={{ fontSize: 12, color: '#6d6f78', marginTop: 3 }}>Replies, reports and developer news land here.</p>
              </div>
            ) : (
              items.map((n) => {
                const m = META[n.type] ?? META.settings;
                const isOpen = expanded.has(n.id);
                const action = actionFor(n, isAdmin);
                return (
                  <div key={n.id}
                    style={{ borderRadius: 10, marginBottom: 2, background: isOpen ? 'rgba(88,101,242,0.06)' : 'transparent', border: `1px solid ${isOpen ? '#2e2e36' : 'transparent'}`, transition: 'background 0.13s, border-color 0.13s' }}
                    onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <button onClick={() => toggleExpand(n.id)}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 11, padding: '10px 10px', border: 'none', background: 'none', cursor: 'pointer', alignItems: 'flex-start' }}>
                      <span style={{ position: 'relative', flex: 'none', width: 32, height: 32, borderRadius: 10, background: `${m.color}16`, border: `1px solid ${m.color}30`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                        <m.icon size={15} />
                        {n.unread && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: '#5865f2', border: '2px solid #111113' }} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: n.unread ? 800 : 700, color: '#f2f3f5', lineHeight: 1.35 }}>{n.title}</span>
                        {n.body && (
                          <span style={{
                            display: '-webkit-box', WebkitLineClamp: isOpen ? 'unset' as never : 2, WebkitBoxOrient: 'vertical' as never,
                            overflow: 'hidden', fontSize: 11.5, color: isOpen ? '#b5bac1' : '#949ba4', marginTop: 3, lineHeight: 1.5, wordBreak: 'break-word',
                          }}>
                            {n.body}
                          </span>
                        )}
                      </span>
                      <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <span title={new Date(n.createdAt * 1000).toLocaleString('en-US')} style={{ fontSize: 10.5, color: '#52535a' }}>{relTime(n.createdAt)}</span>
                        <ChevronDown size={12} color="#52535a" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                      </span>
                    </button>
                    {isOpen && action && (
                      <div style={{ padding: '0 10px 10px 53px' }}>
                        <button onClick={() => runAction(n)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#5865f2', border: 'none', borderRadius: 7, cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#4752c4')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '#5865f2')}>
                          {action.label} <ArrowRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>
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

      <style>{`@keyframes lp-bell-in { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
