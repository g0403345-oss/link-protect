'use client';

/**
 * Settings sync (Premium on the source server) — copy chosen setting sections
 * from one of your servers to others. Opened from the server-list page; brings
 * its own small toast stack because that page has none.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, CheckCircle2, RefreshCw, X, XCircle } from 'lucide-react';

export interface SyncServer {
  id: string;
  name: string;
  iconUrl: string;
  premium: boolean;
}

const SECTIONS = [
  { id: 'protect',   label: 'Blockers' },
  { id: 'warn',      label: 'Warn thresholds' },
  { id: 'messages',  label: 'Messages' },
  { id: 'scamguard', label: 'Scam Shield' },
  { id: 'raid',      label: 'Raid' },
  { id: 'decay',     label: 'Decay' },
  { id: 'blacklist', label: 'Blacklist' },
] as const;

const MAX_TARGETS = 25;

interface Toast { id: number; type: 'success' | 'error'; message: string; }
let toastId = 0;

export default function SyncModal({ open, servers, onClose }: {
  open: boolean;
  servers: SyncServer[];
  onClose: () => void;
}) {
  const [source, setSource] = useState<string>('');
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<Set<string>>(new Set(['protect']));
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: 'success' | 'error', message: string) => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  };

  // Default source: prefer a Premium server — the feature needs one.
  useEffect(() => {
    if (!open) return;
    setTargets(new Set());
    setSource((prev) => {
      if (prev && servers.some((s) => s.id === prev)) return prev;
      return (servers.find((s) => s.premium) ?? servers[0])?.id ?? '';
    });
  }, [open, servers]);

  const targetChoices = useMemo(() => servers.filter((s) => s.id !== source), [servers, source]);

  const toggleTarget = (id: string) => {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_TARGETS) next.add(id);
      return next;
    });
  };

  const toggleSection = (id: string) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceGuildId: source, targetGuildIds: Array.from(targets), sections: Array.from(sections) }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 403) { addToast('error', 'The source server needs Premium'); return; }
      if (!res.ok) { addToast('error', d.error ?? 'Sync failed'); return; }
      const synced: string[] = Array.isArray(d.synced) ? d.synced : [];
      for (const id of targets) {
        const name = servers.find((s) => s.id === id)?.name ?? `…${id.slice(-4)}`;
        if (synced.includes(id)) addToast('success', `${name} — settings synced`);
        else addToast('error', `${name} — could not sync`);
      }
      if (synced.length === targets.size) setTargets(new Set());
    } catch { addToast('error', 'Could not reach the server'); }
    finally { setBusy(false); }
  };

  const sourceServer = servers.find((s) => s.id === source);
  const canRun = !!source && targets.size > 0 && sections.size > 0 && !busy;

  const label = { fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6, display: 'block' } as const;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#111113', border: '1px solid #2e2e36', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ArrowLeftRight size={15} color="#5865f2" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f2f3f5' }}>Sync settings</span>
                </div>
                <button onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', padding: 4, display: 'flex' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#f2f3f5')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
                  <X size={17} />
                </button>
              </div>

              {/* Body */}
              <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Source */}
                <div>
                  <label style={label}>Copy from</label>
                  <select value={source} onChange={(e) => { setSource(e.target.value); setTargets((p) => { const n = new Set(p); n.delete(e.target.value); return n; }); }}
                    style={{ width: '100%', padding: '9px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>{s.premium ? '💎 ' : ''}{s.name}</option>
                    ))}
                  </select>
                  {sourceServer && !sourceServer.premium && (
                    <p style={{ fontSize: 11.5, color: '#f0b232', marginTop: 6 }}>
                      The source server needs 💎 Premium to sync its settings out.
                    </p>
                  )}
                </div>

                {/* Sections */}
                <div>
                  <label style={label}>What to copy</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {SECTIONS.map((s) => {
                      const active = sections.has(s.id);
                      return (
                        <button key={s.id} onClick={() => toggleSection(s.id)}
                          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 99, cursor: 'pointer', border: `1px solid ${active ? 'rgba(88,101,242,0.5)' : '#2e2e36'}`, background: active ? 'rgba(88,101,242,0.14)' : 'transparent', color: active ? '#96a4ff' : '#6d6f78', transition: 'all 0.13s' }}>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Targets */}
                <div>
                  <label style={label}>Copy to ({targets.size}{targets.size >= MAX_TARGETS ? ' — max' : ''})</label>
                  {targetChoices.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: '#52535a' }}>No other servers with Link Protect installed.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                      {targetChoices.map((s) => {
                        const checked = targets.has(s.id);
                        return (
                          <label key={s.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: checked ? 'rgba(88,101,242,0.07)' : '#18181b', border: `1px solid ${checked ? 'rgba(88,101,242,0.4)' : '#2e2e36'}`, borderRadius: 8, cursor: 'pointer', userSelect: 'none', transition: 'all 0.12s' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleTarget(s.id)}
                              style={{ accentColor: '#5865f2', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.iconUrl} alt="" style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }}
                              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#f2f3f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.name}
                            </span>
                            {s.premium && <span style={{ fontSize: 11, flexShrink: 0 }}>💎</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 11.5, color: '#52535a', lineHeight: 1.55 }}>
                  Overwrites the chosen sections on every selected server with the source&rsquo;s
                  values. Whitelists and warned-user records are never touched.
                </p>
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #1e1e22', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onClose}
                  style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
                  Close
                </button>
                <button onClick={run} disabled={!canRun}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', background: '#5865f2', border: 'none', borderRadius: 8, cursor: canRun ? 'pointer' : 'default', opacity: canRun ? 1 : 0.4 }}>
                  {busy ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowLeftRight size={13} />}
                  {busy ? 'Syncing…' : `Sync to ${targets.size || '…'} server${targets.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Own toast stack — the server-list page has none */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#18181b', border: `1px solid ${t.type === 'success' ? 'rgba(35,165,90,0.3)' : 'rgba(242,63,67,0.3)'}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', pointerEvents: 'auto' }}>
              {t.type === 'success' ? <CheckCircle2 size={14} color="#23a55a" /> : <XCircle size={14} color="#f23f43" />}
              <span style={{ fontSize: 13, color: '#f2f3f5' }}>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
