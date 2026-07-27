'use client';

import { useRef, useState, useEffect } from 'react';
import { Heart, Minus, Gavel, RefreshCw, Save, Send, RotateCcw, Info } from 'lucide-react';
import CollapsibleCard, { cardKey } from '@/components/CollapsibleCard';
import type { ServerData } from '@/lib/db';

/* ── template model ─────────────────────────────────────────── */

type TemplateKey = 'warn_channel' | 'warn_manual' | 'warn_dm' | 'action_dm' | 'verify_dm' | 'lockdown_announce';

const DEFAULTS: Record<TemplateKey, string> = {
  warn_channel: '{user} — your message was removed.\n**Reason:** {reason}',
  warn_manual: '{user} was warned by a moderator.\n**Reason:** {reason}',
  warn_dm: 'Your link in **{server}** was removed.\n**Reason:** {reason}',
  action_dm: 'You were **{action}** on **{server}** after reaching {warnings} warnings.',
  verify_dm: 'Welcome to **{server}**! Verify your account to unlock the server: {link}',
  lockdown_announce: '🚨 **Emergency lockdown active.** Links are blocked and invites are paused while the moderators handle the situation.',
};

const WARN_VARS = ['{user}', '{username}', '{server}', '{reason}', '{warnings}', '{remaining}', '{channel}'];

const FIELDS: { key: TemplateKey; label: string; desc: string; short: string; context: string; vars: string[] }[] = [
  { key: 'warn_channel', label: 'Blocked-link warning', short: 'Blocked link', context: 'Posted in the channel',
    desc: 'Public warning posted in the channel when a link is auto-blocked', vars: WARN_VARS },
  { key: 'warn_manual', label: 'Manual warn announcement', short: 'Manual warn', context: 'Posted in the channel',
    desc: 'Announcement when a moderator warns someone with /warn or from the dashboard', vars: WARN_VARS },
  { key: 'warn_dm', label: 'Silent-mode DM', short: 'Silent DM', context: 'Sent as a direct message',
    desc: 'The private DM sent instead of a public warning while Silent Mode is on', vars: WARN_VARS },
  { key: 'action_dm', label: 'Escalation DM', short: 'Escalation', context: 'Sent as a direct message',
    desc: 'Sent to the member before an automatic kick, ban or timeout escalation', vars: ['{user}', '{username}', '{server}', '{action}', '{warnings}'] },
  { key: 'verify_dm', label: 'Verification DM', short: 'Verify DM', context: 'Sent as a direct message',
    desc: 'The DM with the verification link that new members get on join', vars: ['{user}', '{username}', '{server}', '{link}'] },
  { key: 'lockdown_announce', label: 'Lockdown announcement', short: 'Lockdown', context: 'Posted in the channel',
    desc: 'Posted when the emergency lockdown is activated', vars: ['{server}'] },
];

/* ── tone presets ───────────────────────────────────────────── */

const PRESETS: { id: string; label: string; desc: string; color: string; icon: typeof Heart; values: Record<TemplateKey, string> }[] = [
  {
    id: 'friendly', label: 'Friendly', desc: 'Warm, casual, a few emoji', color: '#23a55a', icon: Heart,
    values: {
      warn_channel: 'Hey {user}! 👋 Your message was removed — links like that aren’t allowed here.\n**Reason:** {reason}',
      warn_manual: '{user} just got a friendly heads-up from the mods. 📝\n**Reason:** {reason}',
      warn_dm: 'Hey! Your link in **{server}** was removed. 🙂\n**Reason:** {reason}\nNo hard feelings — we’re just keeping the server safe!',
      action_dm: 'Sorry {username} — you were **{action}** on **{server}** after {warnings} warnings. 💛 If you think this was a mistake, feel free to reach out to the mods.',
      verify_dm: 'Welcome to **{server}**! 🎉 One quick step and you’re in — verify your account here: {link}',
      lockdown_announce: '🚨 Hang tight everyone — **lockdown is active** while the mods handle something. Links and invites are paused, back to normal soon! 💙',
    },
  },
  {
    id: 'neutral', label: 'Neutral', desc: 'The clear defaults', color: '#5865f2', icon: Minus,
    values: { ...DEFAULTS },
  },
  {
    id: 'strict', label: 'Strict', desc: 'Terse and formal, no emoji', color: '#f23f43', icon: Gavel,
    values: {
      warn_channel: '{user} — message removed.\n**Reason:** {reason}\nWarning {warnings}. Further violations will be sanctioned.',
      warn_manual: '{user} has received a formal warning.\n**Reason:** {reason}',
      warn_dm: 'Your message in **{server}** was removed.\n**Reason:** {reason}\nThis is warning {warnings}. Repeated violations lead to removal.',
      action_dm: 'You have been **{action}** on **{server}** after {warnings} warnings. This action was automatic.',
      verify_dm: 'You have joined **{server}**. Access requires verification: {link}',
      lockdown_announce: '**Emergency lockdown in effect.** Links are blocked and invites are paused until further notice.',
    },
  },
];

/* ── preview sample data ────────────────────────────────────── */

const SAMPLE: Record<string, string> = {
  '{user}': '@Scammy',
  '{username}': 'Scammy',
  '{server}': 'Your Server',
  '{reason}': 'Posted a phishing link',
  '{warnings}': '3',
  '{remaining}': '2',
  '{channel}': '#general',
  '{action}': 'kicked',
  '{link}': 'https://link-protect.com/verify/…',
};

const DEFAULT_ACCENT = '#5B6CFF';
const FREE_LEN = 400;
const PREMIUM_LEN = 1500;

function substitute(tpl: string): string {
  let out = tpl;
  for (const [tok, val] of Object.entries(SAMPLE)) out = out.split(tok).join(val);
  return out;
}

/** Minimal Discord markdown: **bold** and line breaks only. */
function renderMd(text: string): React.ReactNode {
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
          ? <strong key={j} style={{ color: '#f2f3f5', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
          : <span key={j}>{part}</span>
      )}
    </span>
  ));
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <CollapsibleCard title={title} storageKey={cardKey('messages', title)}>
      {children}
    </CollapsibleCard>
  );
}

/* ── component ──────────────────────────────────────────────── */

export default function MessagesTab({ guildId, data, patch, saving, onToast }: {
  guildId: string;
  data: ServerData;
  patch: (path: string, value: unknown, label?: string) => Promise<void> | void;
  saving: string | null;
  onToast: (type: 'success' | 'error', msg: string) => void;
}) {
  const msgs = (data.messages ?? {}) as Record<string, string | undefined>;

  /** Effective text for a field: the saved custom value, or the default. */
  const effective = (key: TemplateKey) => {
    const raw = msgs[key];
    return raw && raw.trim() ? raw : DEFAULTS[key];
  };

  const [drafts, setDrafts] = useState<Record<TemplateKey, string>>(() => {
    const init = {} as Record<TemplateKey, string>;
    for (const f of FIELDS) init[f.key] = (msgs[f.key] && msgs[f.key]!.trim()) ? msgs[f.key]! : DEFAULTS[f.key];
    return init;
  });
  const setDraft = (key: TemplateKey, value: string) =>
    setDrafts((prev) => ({ ...prev, [key]: value.slice(0, maxLen) }));

  const [previewKey, setPreviewKey] = useState<TemplateKey>('warn_channel');
  const [testBusy, setTestBusy] = useState(false);
  const taRefs = useRef<Partial<Record<TemplateKey, HTMLTextAreaElement | null>>>({});

  /* Embed accent is a Premium perk: editable when the server has Premium,
     brand color otherwise (the API enforces this server-side too). */
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const [premium, setPremium] = useState(false);
  const savedAccent = HEX_RE.test(msgs.accent ?? '') ? (msgs.accent as string) : DEFAULT_ACCENT;
  const [accentDraft, setAccentDraft] = useState(savedAccent);
  useEffect(() => {
    let alive = true;
    fetch(`/api/guild/${guildId}/premium`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setPremium(!!d.active); })
      .catch(() => {});
    return () => { alive = false; };
  }, [guildId]);
  useEffect(() => { setAccentDraft(savedAccent); }, [savedAccent]);
  const maxLen = premium ? PREMIUM_LEN : FREE_LEN;
  const previewAccent = premium && HEX_RE.test(accentDraft) ? accentDraft : (premium ? savedAccent : DEFAULT_ACCENT);

  const insertVar = (key: TemplateKey, token: string) => {
    const el = taRefs.current[key];
    const cur = drafts[key];
    setPreviewKey(key);
    if (!el) { setDraft(key, cur + token); return; }
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    setDraft(key, cur.slice(0, start) + token + cur.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + token.length, maxLen);
      el.setSelectionRange(pos, pos);
    });
  };

  const applyPreset = (values: Record<TemplateKey, string>) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const f of FIELDS) next[f.key] = values[f.key].slice(0, maxLen);
      return next;
    });
  };

  const resetField = async (key: TemplateKey, label: string) => {
    // Empty string = "use the default" server-side.
    await patch(`messages.${key}`, '', label);
    setDraft(key, DEFAULTS[key]);
  };

  const sendTest = async () => {
    setTestBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/messages/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: previewKey }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { onToast('error', d.error ?? 'Could not send the test DM'); return; }
      onToast('success', 'Test DM sent — check your Discord');
    } catch {
      onToast('error', 'Could not reach the server');
    } finally {
      setTestBusy(false);
    }
  };

  const previewField = FIELDS.find((f) => f.key === previewKey) ?? FIELDS[0];
  const anyDirty = FIELDS.some((f) => drafts[f.key] !== effective(f.key));

  const chip = {
    padding: '3px 8px', fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
    background: 'rgba(88,101,242,0.08)', color: '#96a4ff',
    border: '1px solid rgba(88,101,242,0.25)', borderRadius: 99, cursor: 'pointer',
  } as const;

  return (
    <>
      <div className="msgstudio-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>
        {/* ── Left column: settings ─────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* 1 · Tone presets */}
          <Card title="Tone presets">
            <p style={{ fontSize: 12, color: '#52535a', marginBottom: 12 }}>
              Fill all templates with a coherent voice in one click — then tweak and save the ones you like below.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {PRESETS.map((p) => {
                const Icon = p.icon;
                return (
                  <button key={p.id} onClick={() => applyPreset(p.values)}
                    style={{ textAlign: 'left', padding: '12px 14px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 9, cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = p.color)}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#2e2e36')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Icon size={13} color={p.color} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f2f3f5' }}>{p.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#6d6f78', lineHeight: 1.5 }}>{p.desc}</div>
                  </button>
                );
              })}
            </div>
            {anyDirty && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(240,178,50,0.06)', border: '1px solid rgba(240,178,50,0.2)', borderRadius: 8 }}>
                <Info size={13} color="#f0b232" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#6d6f78' }}>
                  Nothing is saved yet — edited templates are marked below. Review each one and hit its <b style={{ color: '#949ba4' }}>Save</b> button.
                </p>
              </div>
            )}
          </Card>

          {/* 2 · Templates */}
          <Card title="Templates">
            {FIELDS.map((f, i) => {
              const draft = drafts[f.key];
              const dirty = draft !== effective(f.key);
              const path = `messages.${f.key}`;
              const busy = saving === path;
              const hasCustom = !!(msgs[f.key] && msgs[f.key]!.trim());
              return (
                <div key={f.key} style={{ marginTop: i === 0 ? 0 : 16, paddingTop: i === 0 ? 0 : 16, borderTop: i === 0 ? 'none' : '1px solid #1e1e22' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>{f.label}</span>
                    {hasCustom && !dirty && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#23a55a', background: 'rgba(35,165,90,0.12)', padding: '1px 7px', borderRadius: 99 }}>custom</span>
                    )}
                    {dirty && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#f0b232', background: 'rgba(240,178,50,0.12)', padding: '1px 7px', borderRadius: 99 }}>unsaved</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#52535a', marginBottom: 8 }}>{f.desc}</p>
                  <textarea
                    ref={(el) => { taRefs.current[f.key] = el; }}
                    className="discord-input"
                    value={draft}
                    rows={draft.split('\n').length > 2 ? Math.min(6, draft.split('\n').length) : 2}
                    maxLength={maxLen}
                    onChange={(e) => { setDraft(f.key, e.target.value); setPreviewKey(f.key); }}
                    onFocus={() => setPreviewKey(f.key)}
                    style={{ fontSize: 13, lineHeight: 1.5, resize: 'vertical', minHeight: 56, borderColor: dirty ? '#f0b232' : undefined }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                    {f.vars.map((v) => (
                      <button key={v} onClick={() => insertVar(f.key, v)} title={`Insert ${v}`} style={chip}>{v}</button>
                    ))}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: draft.length >= maxLen ? '#f23f43' : '#52535a', fontVariantNumeric: 'tabular-nums' }}>
                      {draft.length}/{maxLen}
                    </span>
                  </div>
                  {(dirty || hasCustom) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
                      {dirty && (
                        <button onClick={() => patch(path, draft.slice(0, maxLen), f.label)} disabled={busy}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                          {busy ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Save
                        </button>
                      )}
                      {hasCustom && (
                        <button onClick={() => resetField(f.key, f.label)} disabled={busy}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, fontSize: 12, fontWeight: 600, background: 'none', border: 'none', color: '#6d6f78', cursor: 'pointer', transition: 'color 0.15s' }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f2f3f5')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#6d6f78')}>
                          <RotateCcw size={11} /> Reset to default
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>

        </div>

          {/* 3 · Embed accent — Premium */}
          <Card title="Embed accent 💎">
            {premium ? (
              <>
                <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>
                  The color stripe on the left edge of every embed the bot sends.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {['#5B6CFF', '#5865f2', '#23a55a', '#f0b232', '#eb459e', '#f23f43'].map((c) => (
                    <button key={c} title={c}
                      onClick={() => { setAccentDraft(c); patch('messages.accent', c, 'Embed accent'); }}
                      disabled={saving === 'messages.accent'}
                      style={{ width: 26, height: 26, borderRadius: 8, background: c, border: previewAccent.toLowerCase() === c.toLowerCase() ? '2px solid #f2f3f5' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                  <input value={accentDraft} onChange={(e) => setAccentDraft(e.target.value)} maxLength={7} spellCheck={false}
                    style={{ width: 90, padding: '6px 9px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, color: '#f2f3f5', outline: 'none', fontFamily: 'monospace' }} />
                  {HEX_RE.test(accentDraft) && accentDraft.toLowerCase() !== savedAccent.toLowerCase() && (
                    <button onClick={() => patch('messages.accent', accentDraft, 'Embed accent')} disabled={saving === 'messages.accent'}
                      style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: saving === 'messages.accent' ? 0.6 : 1 }}>
                      Save
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: '#949ba4', lineHeight: 1.6 }}>
                Give every bot embed your server&apos;s own color — a <b style={{ color: '#96a4ff' }}>💎 Premium</b> perk.
                Upgrade from the Overview tab to unlock it.
              </p>
            )}
          </Card>
        {/* ── Right column: live preview (sticky on desktop) ── */}
        <div className="msgstudio-preview" style={{ position: 'sticky', top: 120 }}>
          <div style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10 }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e1e22' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#949ba4' }}>Live preview</span>
            </div>
            <div style={{ padding: 14 }}>
              {/* template switcher */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {FIELDS.map((f) => {
                  const active = previewKey === f.key;
                  return (
                    <button key={f.key} onClick={() => setPreviewKey(f.key)}
                      style={{ padding: '4px 9px', fontSize: 11, fontWeight: 600, borderRadius: 99, cursor: 'pointer', transition: 'all 0.12s', background: active ? 'rgba(88,101,242,0.15)' : 'transparent', color: active ? '#96a4ff' : '#6d6f78', border: `1px solid ${active ? 'rgba(88,101,242,0.4)' : '#2e2e36'}` }}>
                      {f.short}
                    </button>
                  );
                })}
              </div>

              {/* Discord-style message */}
              <div style={{ background: '#313338', borderRadius: 10, padding: '14px 14px 16px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }} aria-hidden>
                    🛡️
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#f2f3f5' }}>Link Protect</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: '#5865f2', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.02em' }}>BOT</span>
                      <span style={{ fontSize: 10.5, color: '#949ba4' }}>Today at 12:00</span>
                    </div>
                    <div style={{ marginTop: 6, background: '#2b2d31', borderLeft: `4px solid ${previewAccent}`, borderRadius: 4, padding: '10px 12px', fontSize: 13, color: '#dbdee1', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {renderMd(substitute(drafts[previewKey]))}
                    </div>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#52535a', marginTop: 8 }}>
                {previewField.context} · sample values, unsaved edits included
              </p>

              {/* test DM */}
              <button className="btn-secondary btn-sm" onClick={sendTest} disabled={testBusy}
                style={{ width: '100%', marginTop: 12, opacity: testBusy ? 0.6 : 1 }}>
                {testBusy
                  ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Send size={13} />}
                {testBusy ? 'Sending…' : 'Send me a test DM'}
              </button>
              <p style={{ fontSize: 11, color: '#52535a', marginTop: 6, textAlign: 'center' }}>
                The bot DMs you the <b style={{ color: '#949ba4' }}>saved</b> version of “{previewField.label}”.
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1100px) {
          .msgstudio-grid { grid-template-columns: 1fr !important; }
          .msgstudio-preview { position: static !important; }
        }
      `}</style>
    </>
  );
}
