'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, X, ShieldAlert, ShieldOff, Bug, MessageSquare, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReportType } from '@/lib/db';

const TYPES: { id: ReportType; label: string; desc: string; icon: typeof Flag; needsUrl?: boolean }[] = [
  { id: 'malicious_link', label: 'Malicious link', desc: 'A scam / phishing / malware URL', icon: ShieldAlert, needsUrl: true },
  { id: 'false_positive', label: 'False positive', desc: 'A safe link that was wrongly blocked', icon: ShieldOff, needsUrl: true },
  { id: 'bug', label: 'Bug / error', desc: 'Something is broken in the bot, dashboard or app', icon: Bug },
  { id: 'feedback', label: 'Feedback', desc: 'An idea or general feedback', icon: MessageSquare },
];

const CATEGORIES = ['scam', 'phishing', 'malware', 'nitro'];

export default function ReportForm({ guildId }: { guildId?: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReportType>('malicious_link');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('scam');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guild, setGuild] = useState(guildId ?? '');
  const [guilds, setGuilds] = useState<{ id: string; name: string }[]>([]);

  // Load the user's servers so a report can be tied to a specific one.
  useEffect(() => {
    if (!open || guilds.length) return;
    fetch('/api/guilds')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setGuilds(d.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))); })
      .catch(() => {});
  }, [open, guilds.length]);

  const meta = TYPES.find((t) => t.id === type)!;

  const reset = () => {
    setType('malicious_link'); setUrl(''); setCategory('scam'); setMessage('');
    setSubmitting(false); setDone(false); setError(null); setGuild(guildId ?? '');
  };
  const close = () => { setOpen(false); setTimeout(reset, 200); };

  const submit = async () => {
    if (submitting) return;
    if (meta.needsUrl && !url.trim()) { setError('Please enter the link.'); return; }
    if (!meta.needsUrl && !message.trim()) { setError('Please describe it.'); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          url: meta.needsUrl ? url.trim() : undefined,
          category: type === 'malicious_link' ? category : undefined,
          message: message.trim() || undefined,
          guildId: guild || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'Could not submit.'); setSubmitting(false); return; }
      setDone(true);
      setTimeout(close, 1400);
    } catch {
      setError('Network error — please try again.'); setSubmitting(false);
    }
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 13, background: '#18181b',
    border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <>
      <button onClick={() => setOpen(true)} title="Report a link, bug or idea"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f2f3f5'; (e.currentTarget as HTMLElement).style.borderColor = '#5865f2'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#949ba4'; (e.currentTarget as HTMLElement).style.borderColor = '#2e2e36'; }}>
        <Flag size={13} /> <span className="crumb-btn-label">Report</span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={close}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                onClick={(e) => e.stopPropagation()}
                style={{ background: '#111113', border: '1px solid #2e2e36', borderRadius: 14, width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
                {/* header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e1e22', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#f2f3f5' }}>Report</span>
                  <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', display: 'flex' }}><X size={18} /></button>
                </div>

                {done ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <CheckCircle2 size={36} color="#23a55a" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#f2f3f5' }}>Thanks — report sent!</p>
                    <p style={{ fontSize: 13, color: '#52535a', marginTop: 4 }}>Our team will take a look.</p>
                  </div>
                ) : (
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* type */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {TYPES.map((t) => {
                        const active = type === t.id;
                        return (
                          <button key={t.id} onClick={() => setType(t.id)}
                            style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', textAlign: 'left', borderRadius: 9, cursor: 'pointer', border: `1px solid ${active ? '#5865f2' : '#2e2e36'}`, background: active ? 'rgba(88,101,242,0.1)' : '#18181b' }}>
                            <t.icon size={15} color={active ? '#96a4ff' : '#6d6f78'} />
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#f2f3f5' : '#949ba4' }}>{t.label}</span>
                            <span style={{ fontSize: 10.5, color: '#52535a', lineHeight: 1.3 }}>{t.desc}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', display: 'block', marginBottom: 6 }}>
                        Which server is this about? {type === 'bug' || type === 'false_positive' ? '' : '(optional)'}
                      </label>
                      <select value={guild} onChange={(e) => setGuild(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                        <option value="">— Not about a specific server —</option>
                        {guilds.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      {guilds.length === 0 && (
                        <p style={{ fontSize: 10.5, color: '#52535a', marginTop: 5 }}>
                          Sign in and manage a server to attach it here.
                        </p>
                      )}
                    </div>

                    {meta.needsUrl && (
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', display: 'block', marginBottom: 6 }}>Link</label>
                        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={input}
                          onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')} onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
                      </div>
                    )}

                    {type === 'malicious_link' && (
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', display: 'block', marginBottom: 6 }}>Threat type</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {CATEGORIES.map((c) => (
                            <button key={c} onClick={() => setCategory(c)}
                              style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${category === c ? '#5865f2' : '#2e2e36'}`, background: category === c ? 'rgba(88,101,242,0.15)' : 'transparent', color: category === c ? '#96a4ff' : '#949ba4' }}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#949ba4', display: 'block', marginBottom: 6 }}>
                        {meta.needsUrl ? 'Details (optional)' : 'Details'}
                      </label>
                      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                        placeholder={type === 'feedback' ? 'Your idea or feedback…' : type === 'bug' ? 'What went wrong, and where?' : 'Anything else we should know…'}
                        style={{ ...input, resize: 'vertical', minHeight: 64 }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = '#5865f2')} onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e36')} />
                    </div>

                    {error && <p style={{ fontSize: 12, color: '#f23f43', margin: 0 }}>{error}</p>}

                    <button onClick={submit} disabled={submitting}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px', fontSize: 14, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                      {submitting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Flag size={14} />}
                      Send report
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
