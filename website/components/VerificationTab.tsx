'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  UserCheck, RefreshCw, CheckCircle2, XCircle, Copy, Check, Save,
  ShieldCheck, Clock, Search, ChevronDown, ImagePlus, Trash2, Zap, Gem,
} from 'lucide-react';
import ToggleSwitch from '@/components/ToggleSwitch';
import CollapsibleCard, { cardKey } from '@/components/CollapsibleCard';
import PremiumTag from '@/components/PremiumTag';
import PremiumLockNote from '@/components/PremiumLockNote';
import type { ServerData, VerifyHealth } from '@/lib/db';

interface Role { id: string; name: string; color: number; position: number; }

const ACCENT_PRESETS = ['#5865f2', '#23a55a', '#f0b232', '#eb459e'];
const roleColor = (c: number) => (c ? `#${c.toString(16).padStart(6, '0')}` : '#949ba4');

function Card({ title, children, premium }: { title: string; children: React.ReactNode; premium?: boolean }) {
  return (
    <CollapsibleCard storageKey={cardKey('verify', title)}
      title={premium ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{title}<PremiumTag /></span> : title}>
      {children}
    </CollapsibleCard>
  );
}

export default function VerificationTab({ guildId, data, patch, saving, guildIcon, onToast, onRefresh }: {
  guildId: string;
  data: ServerData;
  patch: (path: string, value: unknown, label?: string) => Promise<void> | void;
  saving: string | null;
  guildIcon?: string | null;
  onToast?: (type: 'success' | 'error', message: string) => void;
  onRefresh?: () => void;
}) {
  const verify = data.verify ?? {};
  const enabled = !!verify.enabled;
  const mode = verify.role_mode === 'quarantine' ? 'quarantine' : 'verified';
  const page = verify.page ?? {};
  const accent = /^#[0-9a-fA-F]{6}$/.test(page.accent ?? '') ? (page.accent as string) : '#5865f2';

  /* roles */
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleQuery, setRoleQuery] = useState('');
  const roleRef = useRef<HTMLDivElement>(null);

  /* page customization drafts */
  const [headline, setHeadline] = useState(page.headline ?? '');
  const [message, setMessage] = useState(page.message ?? '');
  const [accentDraft, setAccentDraft] = useState(accent);
  /* Premium rules gate draft */
  const [rulesDraft, setRulesDraft] = useState(page.rules ?? '');
  const pageDirty = headline !== (page.headline ?? '') || message !== (page.message ?? '') || accentDraft !== accent;
  const [pageSaving, setPageSaving] = useState(false);

  /* health + stats */
  const [health, setHealth] = useState<VerifyHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; last7: number } | null>(null);
  const [copied, setCopied] = useState(false);

  /* background image */
  const [bgVersion, setBgVersion] = useState<number | null>(null); // null = none
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Premium branding: custom logo + vanity slug */
  const [premium, setPremium] = useState<boolean | null>(null);
  const [logoVersion, setLogoVersion] = useState<number | null>(null); // null = none
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [slugSaved, setSlugSaved] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugBusy, setSlugBusy] = useState(false);

  /* one-click role + channel setup */
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupConfirm, setSetupConfirm] = useState(false);

  const runSetup = async () => {
    if (!setupConfirm) {
      setSetupConfirm(true);
      setTimeout(() => setSetupConfirm(false), 4500);
      return;
    }
    setSetupConfirm(false);
    setSetupBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/verify/setup-role`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { onToast?.('error', d.error ?? 'Setup failed'); return; }
      onToast?.('success',
        `@${d.roleName} ${d.roleCreated ? 'created' : 'reused'} — ${d.channelsLocked} channels locked`
        + (d.channelsSkipped ? `, ${d.channelsSkipped} already done` : '')
        + (d.infoChannel === 'created' ? ', #verify channel created' : ''));
      // Pull fresh settings/roles/health — the endpoint changed all three.
      onRefresh?.();
      fetch(`/api/guild/${guildId}/discord-roles`)
        .then((r) => (r.ok ? r.json() : null))
        .then((rd) => { if (rd?.roles) setRoles(rd.roles as Role[]); })
        .catch(() => {});
      loadHealth();
    } catch {
      onToast?.('error', 'Could not reach the server');
    } finally {
      setSetupBusy(false);
    }
  };

  useEffect(() => {
    fetch(`/api/guild/${guildId}/discord-roles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.roles) setRoles(d.roles as Role[]); })
      .catch(() => {});
    fetch(`/api/guild/${guildId}/verify/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setStats(d); })
      .catch(() => {});
    fetch(`/api/verify/${guildId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.background) setBgVersion(d.backgroundVersion ?? 1);
        if (d?.logo) setLogoVersion(d.logoVersion ?? 1);
        if (typeof d?.slug === 'string' && d.slug) { setSlugSaved(d.slug); setSlugDraft(d.slug); }
      })
      .catch(() => {});
    fetch(`/api/guild/${guildId}/premium`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPremium(!!d.active); })
      .catch(() => {});
  }, [guildId]);

  /** Downscale + compress in the browser so uploads are always fast and small:
   *  max 1920×1200, JPEG, targets ≤ ~1 MB (retries at lower quality). */
  const processAndUpload = async (file: File) => {
    setBgBusy(true); setBgError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / bitmap.width, 1200 / bitmap.height);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      ctx.drawImage(bitmap, 0, 0, w, h);
      let blob: Blob | null = null;
      for (const quality of [0.82, 0.68, 0.55]) {
        blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
        if (blob && blob.size <= 1_000_000) break;
      }
      if (!blob) throw new Error();
      if (blob.size > 1_400_000) { setBgError('Image is too complex — try a simpler one.'); return; }
      const res = await fetch(`/api/guild/${guildId}/verify/background`, { method: 'PUT', body: blob });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setBgError(d.error ?? 'Upload failed'); return; }
      setBgVersion(d.version ?? Date.now());
    } catch {
      setBgError('Couldn’t read that image — use a JPEG, PNG or WebP.');
    } finally {
      setBgBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeBackground = async () => {
    setBgBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/verify/background`, { method: 'DELETE' });
      if (res.ok) setBgVersion(null);
    } catch { /* ignore */ }
    finally { setBgBusy(false); }
  };

  /** Same client-side pipeline as the background, tuned for a logo:
   *  max 256px, PNG first (transparency), JPEG fallback, hard cap 512 KB. */
  const processAndUploadLogo = async (file: File) => {
    setLogoBusy(true); setLogoError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 256 / bitmap.width, 256 / bitmap.height);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      ctx.drawImage(bitmap, 0, 0, w, h);
      let blob: Blob | null = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob || blob.size > 512_000) {
        for (const quality of [0.85, 0.7]) {
          blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
          if (blob && blob.size <= 512_000) break;
        }
      }
      if (!blob) throw new Error();
      if (blob.size > 512_000) { setLogoError('Logo is too complex — try a simpler image.'); return; }
      const res = await fetch(`/api/guild/${guildId}/verify/logo`, { method: 'PUT', body: blob });
      const d = await res.json().catch(() => ({}));
      if (res.status === 403) { onToast?.('error', 'Premium feature'); return; }
      if (!res.ok) { setLogoError(d.error ?? 'Upload failed'); return; }
      setLogoVersion(d.version ?? Date.now());
      onToast?.('success', 'Logo uploaded');
    } catch {
      setLogoError('Couldn’t read that image — use a JPEG, PNG or WebP.');
    } finally {
      setLogoBusy(false);
      if (logoFileRef.current) logoFileRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/verify/logo`, { method: 'DELETE' });
      if (res.ok) setLogoVersion(null);
    } catch { /* ignore */ }
    finally { setLogoBusy(false); }
  };

  const slugDirty = slugDraft !== (slugSaved ?? '');
  const slugValid = slugDraft === '' || /^[a-z0-9-]{3,32}$/.test(slugDraft);

  const saveSlug = async () => {
    if (!slugValid) return;
    setSlugBusy(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/verify/slug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slugDraft }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409) { onToast?.('error', 'That link is already taken — try another'); return; }
      if (res.status === 403) { onToast?.('error', 'Premium feature'); return; }
      if (!res.ok) { onToast?.('error', d.error ?? 'Could not save the link'); return; }
      const saved = (d.slug ?? slugDraft) || null;
      setSlugSaved(saved);
      setSlugDraft(saved ?? '');
      onToast?.('success', saved ? 'Vanity link saved' : 'Vanity link removed');
    } catch { onToast?.('error', 'Could not reach the server'); }
    finally { setSlugBusy(false); }
  };

  const loadHealth = useCallback(() => {
    setHealthLoading(true);
    fetch(`/api/guild/${guildId}/verify/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.checks) setHealth(d as VerifyHealth); })
      .catch(() => {})
      .finally(() => setHealthLoading(false));
  }, [guildId]);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setRoleOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedRole = roles.find((r) => r.id === verify.role_id);
  const filteredRoles = roles.filter((r) => r.name.toLowerCase().includes(roleQuery.toLowerCase()));

  const savePage = async () => {
    setPageSaving(true);
    // Sequential — the settings PATCH does read-modify-write on one JSON doc.
    await patch('verify.page.headline', headline.slice(0, 80), 'Page headline');
    await patch('verify.page.message', message.slice(0, 400), 'Page message');
    await patch('verify.page.accent', /^#[0-9a-fA-F]{6}$/.test(accentDraft) ? accentDraft : '#5865f2', 'Page accent');
    setPageSaving(false);
  };

  const verifyUrl = `https://link-protect.com/verify/${guildId}`;
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(verifyUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const input = { padding: '9px 12px', fontSize: 13, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      {stats && (stats.total > 0 || enabled) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[{ label: 'Members verified (total)', value: stats.total, color: '#23a55a' },
            { label: 'Verified — last 7 days', value: stats.last7, color: '#5865f2' }].map((s) => (
            <div key={s.label} style={{ background: '#111113', border: '1px solid #1e1e22', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color, letterSpacing: '-0.02em' }}>{(s.value ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: 11.5, color: '#52535a', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main toggle + mode */}
      <Card title="Verification Gate">
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => patch('verify.enabled', v, 'Verification gate')}
          label="Require web verification"
          description="New members verify with one Discord login on your personal verification page — a hurdle bots can't take."
          disabled={saving === 'verify.enabled'}
        />
        {enabled && (
          <>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e1e22' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', marginBottom: 4 }}>Mode</div>
              <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>How the gate uses the role below</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                {([
                  { id: 'verified', title: 'Grant verified role', desc: 'Members get the role AFTER verifying. Set up your channels so only this role can see them.' },
                  { id: 'quarantine', title: 'Quarantine on join', desc: 'New members get the role ON JOIN (locking them out); verifying removes it again.' },
                ] as const).map((m) => {
                  const active = mode === m.id;
                  return (
                    <button key={m.id} onClick={() => patch('verify.role_mode', m.id, 'Verification mode')}
                      disabled={saving === 'verify.role_mode'}
                      style={{ textAlign: 'left', padding: '12px 14px', background: active ? 'rgba(88,101,242,0.1)' : '#18181b', border: `1px solid ${active ? '#5865f2' : '#2e2e36'}`, borderRadius: 9, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#96a4ff' : '#f2f3f5', marginBottom: 3 }}>{m.title}</div>
                      <div style={{ fontSize: 11.5, color: '#6d6f78', lineHeight: 1.5 }}>{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Role picker */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e1e22' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5', marginBottom: 4 }}>
                {mode === 'quarantine' ? 'Quarantine role' : 'Verified role'}
              </div>
              <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>
                {mode === 'quarantine'
                  ? 'Assigned on join, removed after verification — restrict this role from seeing your channels.'
                  : 'Granted after verification — only show your channels to this role.'}
              </p>
              <div ref={roleRef} style={{ position: 'relative', maxWidth: 340 }}>
                <button onClick={() => setRoleOpen(!roleOpen)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', color: '#f2f3f5', fontSize: 13 }}>
                  {selectedRole ? (
                    <><span style={{ width: 10, height: 10, borderRadius: '50%', background: roleColor(selectedRole.color), flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{selectedRole.name}</span></>
                  ) : (
                    <span style={{ flex: 1, textAlign: 'left', color: '#52535a' }}>Pick a role…</span>
                  )}
                  <ChevronDown size={14} color="#52535a" style={{ transform: roleOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                {roleOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#18181b', border: '1px solid #2e2e36', borderRadius: 10, zIndex: 50, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
                    <div style={{ position: 'relative', borderBottom: '1px solid #2e2e36' }}>
                      <Search size={13} color="#52535a" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                      <input autoFocus value={roleQuery} onChange={(e) => setRoleQuery(e.target.value)} placeholder="Search roles…"
                        style={{ width: '100%', padding: '9px 12px 9px 32px', fontSize: 13, background: 'transparent', border: 'none', color: '#f2f3f5', outline: 'none', fontFamily: 'inherit' }} />
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {filteredRoles.map((r) => (
                        <button key={r.id}
                          onClick={() => { patch('verify.role_id', r.id, 'Verification role'); setRoleOpen(false); setRoleQuery(''); loadHealth(); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#f2f3f5', fontSize: 13, textAlign: 'left' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#232329')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: roleColor(r.color), flexShrink: 0 }} />
                          @{r.name}
                        </button>
                      ))}
                      {filteredRoles.length === 0 && <p style={{ padding: 12, fontSize: 12, color: '#52535a' }}>No roles found</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* One-click role + channel setup */}
            <div style={{ marginTop: 14, padding: '13px 14px', background: 'rgba(88,101,242,0.05)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <Zap size={13} color="#f0b232" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f2f3f5' }}>Auto-setup — no manual channel work</span>
                  </div>
                  <p style={{ fontSize: 11.5, color: '#6d6f78', lineHeight: 1.55 }}>
                    One click: {selectedRole ? <>uses <b style={{ color: '#f2f3f5' }}>@{selectedRole.name}</b></> : <>creates an <b style={{ color: '#f2f3f5' }}>@Unverified</b> role</>},
                    hides <b style={{ color: '#f2f3f5' }}>every category &amp; channel</b> from it (existing locks are kept),
                    creates a <b style={{ color: '#f2f3f5' }}>#verify</b> info channel only that role can see, and switches
                    the gate to quarantine mode. Safe to re-run any time.
                  </p>
                </div>
                <button onClick={runSetup} disabled={setupBusy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', fontSize: 13, fontWeight: 700, background: setupConfirm ? '#f0b232' : '#5865f2', color: setupConfirm ? '#111' : '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', opacity: setupBusy ? 0.6 : 1, transition: 'all 0.15s', flexShrink: 0 }}>
                  {setupBusy ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
                  {setupBusy ? 'Locking channels…' : setupConfirm ? 'Run setup now?' : 'Auto-setup'}
                </button>
              </div>
              {setupBusy && (
                <p style={{ fontSize: 11, color: '#52535a', marginTop: 8 }}>
                  Applying channel permissions one by one — up to a minute on large servers.
                </p>
              )}
            </div>

            {/* Min account age */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e1e22', maxWidth: 340 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Clock size={14} color="#f0b232" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f2f3f5' }}>Minimum account age (days)</span>
              </div>
              <p style={{ fontSize: 12, color: '#52535a', marginBottom: 10 }}>Accounts younger than this can&rsquo;t verify. 0 = off.</p>
              <AgeInput value={verify.min_account_age_days ?? 0}
                onSave={(v) => patch('verify.min_account_age_days', v, 'Minimum account age')}
                saving={saving === 'verify.min_account_age_days'} />
            </div>
          </>
        )}
      </Card>

      {/* Permission health */}
      <Card title="Bot Permission Check">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 12.5, color: '#6d6f78' }}>
            Everything the gate and the lockdown button need — checked live against Discord.
          </p>
          <button onClick={loadHealth} style={{ padding: '6px 9px', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}>
            <RefreshCw size={13} color="#6d6f78" style={{ animation: healthLoading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
        {!health ? (
          <p style={{ fontSize: 13, color: '#52535a' }}>Checking…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {health.checks.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: '#18181b', border: `1px solid ${c.ok ? '#2e2e36' : 'rgba(242,63,67,0.4)'}`, borderRadius: 8 }}>
                {c.ok ? <CheckCircle2 size={15} color="#23a55a" style={{ flexShrink: 0, marginTop: 1 }} />
                      : <XCircle size={15} color="#f23f43" style={{ flexShrink: 0, marginTop: 1 }} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.ok ? '#f2f3f5' : '#f23f43' }}>{c.label}</div>
                  <div style={{ fontSize: 11.5, color: '#6d6f78', marginTop: 1 }}>{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Page customization + preview */}
      <Card title="Your Verification Page">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Headline</label>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80}
                placeholder="Verify to join the conversation" style={{ ...input, width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={400} rows={3}
                placeholder="This server uses Link Protect to keep scam bots out…"
                style={{ ...input, width: '100%', resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Accent color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {ACCENT_PRESETS.map((c) => (
                  <button key={c} onClick={() => setAccentDraft(c)} title={c}
                    style={{ width: 26, height: 26, borderRadius: 8, background: c, border: accentDraft === c ? '2px solid #f2f3f5' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
                <input value={accentDraft} onChange={(e) => setAccentDraft(e.target.value)} maxLength={7}
                  style={{ ...input, width: 90, fontFamily: 'monospace', padding: '6px 9px' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Background image</label>
              <p style={{ fontSize: 11.5, color: '#52535a', marginBottom: 8, lineHeight: 1.5 }}>
                Shown faded behind your page, like our homepage hero. Any image works — it&rsquo;s
                automatically resized to max 1920px and compressed to under 1&nbsp;MB.
              </p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processAndUpload(f); }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => fileRef.current?.click()} disabled={bgBusy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', fontSize: 12.5, fontWeight: 600, color: '#f2f3f5', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', opacity: bgBusy ? 0.6 : 1 }}>
                  {bgBusy ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ImagePlus size={13} />}
                  {bgVersion ? 'Replace image' : 'Upload image'}
                </button>
                {bgVersion && (
                  <button onClick={removeBackground} disabled={bgBusy}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, color: '#f23f43', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.3)', borderRadius: 8, cursor: 'pointer' }}>
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
              {bgError && <p style={{ fontSize: 12, color: '#f23f43', marginTop: 8 }}>{bgError}</p>}
            </div>
            {pageDirty && (
              <button onClick={savePage} disabled={pageSaving}
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: pageSaving ? 0.6 : 1 }}>
                {pageSaving ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Save page
              </button>
            )}
          </div>

          {/* Live preview */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Live preview</label>
            <div style={{ borderRadius: 14, border: '1px solid #2e2e36', background: '#0a0a0c', padding: '26px 18px', textAlign: 'center', position: 'relative', overflow: 'hidden', isolation: 'isolate' }}>
              {bgVersion && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/verify/bg/${guildId}?v=${bgVersion}`} alt="" aria-hidden
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.28, WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)', maskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)' }} />
              )}
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(300px circle at 50% -20%, ${/^#[0-9a-fA-F]{6}$/.test(accentDraft) ? accentDraft : '#5865f2'}30, transparent 70%)` }} />
              <div style={{ position: 'relative' }}>
                {guildIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`https://cdn.discordapp.com/icons/${guildId}/${guildIcon}.webp?size=64`} alt=""
                    style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 10px', display: 'block' }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 10px', background: '#2e2e36', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={22} color="#6d6f78" />
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f2f3f5', marginBottom: 6 }}>
                  {headline.trim() || 'Verify to join the conversation'}
                </div>
                <p style={{ fontSize: 11.5, color: '#949ba4', lineHeight: 1.55, marginBottom: 14 }}>
                  {message.trim() || 'This server uses Link Protect to keep scam bots out. One click with your Discord account and you’re in.'}
                </p>
                <span style={{ display: 'inline-block', padding: '8px 18px', fontSize: 12, fontWeight: 700, background: /^#[0-9a-fA-F]{6}$/.test(accentDraft) ? accentDraft : '#5865f2', color: '#fff', borderRadius: 8 }}>
                  Verify with Discord
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #1e1e22' }}>
          <UserCheck size={14} color="#5865f2" style={{ flexShrink: 0 }} />
          <code style={{ flex: 1, fontSize: 12, color: '#949ba4', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 7, padding: '8px 10px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {verifyUrl}
          </code>
          <button onClick={copyUrl}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: copied ? '#23a55a' : '#949ba4', background: '#18181b', border: `1px solid ${copied ? 'rgba(35,165,90,0.4)' : '#2e2e36'}`, borderRadius: 7, cursor: 'pointer', flexShrink: 0 }}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: '#52535a', marginTop: 8 }}>
          New members automatically get this link in a DM — pin it in your rules channel too.
        </p>
      </Card>

      {/* Premium branding: custom logo + vanity link */}
      <Card title="Branding" premium>
        {premium === false ? (
          <PremiumLockNote text="💎 Your own logo on the verify page and a memorable vanity link — Premium extras. Protection itself stays free." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Custom logo */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Custom logo</label>
              <p style={{ fontSize: 11.5, color: '#52535a', marginBottom: 10, lineHeight: 1.5 }}>
                Replaces the Discord server icon on your verification page. Automatically resized
                to max 256px and kept under 512&nbsp;KB — transparent PNGs look best.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {logoVersion && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/verify/logo/${guildId}?v=${logoVersion}`} alt="Custom logo preview"
                    style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'contain', background: '#0a0a0c', border: '1px solid #2e2e36', flexShrink: 0 }} />
                )}
                <input ref={logoFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processAndUploadLogo(f); }} />
                <button onClick={() => logoFileRef.current?.click()} disabled={logoBusy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', fontSize: 12.5, fontWeight: 600, color: '#f2f3f5', background: '#18181b', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer', opacity: logoBusy ? 0.6 : 1 }}>
                  {logoBusy ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ImagePlus size={13} />}
                  {logoVersion ? 'Replace logo' : 'Upload logo'}
                </button>
                {logoVersion && (
                  <button onClick={removeLogo} disabled={logoBusy}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, color: '#f23f43', background: 'rgba(242,63,67,0.08)', border: '1px solid rgba(242,63,67,0.3)', borderRadius: 8, cursor: 'pointer' }}>
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
              {logoError && <p style={{ fontSize: 12, color: '#f23f43', marginTop: 8 }}>{logoError}</p>}
            </div>

            {/* Vanity slug */}
            <div style={{ paddingTop: 16, borderTop: '1px solid #1e1e22' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Vanity verify link</label>
              <p style={{ fontSize: 11.5, color: '#52535a', marginBottom: 10, lineHeight: 1.5 }}>
                A memorable address instead of the server ID — 3–32 characters, lowercase letters,
                numbers and dashes. Leave it empty to remove the link.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#18181b', border: `1px solid ${slugDraft && !slugValid ? '#f23f43' : '#2e2e36'}`, borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ padding: '9px 0 9px 12px', fontSize: 12.5, color: '#52535a', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>link-protect.com/verify/</span>
                  <input value={slugDraft} maxLength={32} placeholder="my-server"
                    onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    style={{ width: 130, padding: '9px 12px 9px 2px', fontSize: 12.5, background: 'transparent', border: 'none', color: '#f2f3f5', outline: 'none', fontFamily: 'monospace' }} />
                </div>
                {slugDirty && (
                  <button onClick={saveSlug} disabled={slugBusy || !slugValid}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 12, fontWeight: 600, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: slugBusy || !slugValid ? 0.5 : 1 }}>
                    {slugBusy ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Save
                  </button>
                )}
              </div>
              {slugDraft !== '' && !slugValid && (
                <p style={{ fontSize: 11.5, color: '#f23f43', marginTop: 8 }}>3–32 characters: a–z, 0–9 and dashes.</p>
              )}
              {slugSaved && !slugDirty && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#23a55a', marginTop: 10 }}>
                  <Gem size={12} /> Live at{' '}
                  <a href={`https://link-protect.com/verify/${slugSaved}`} target="_blank" rel="noreferrer"
                    style={{ color: '#96a4ff', fontFamily: 'monospace', textDecoration: 'none' }}>
                    link-protect.com/verify/{slugSaved}
                  </a>
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Premium: rules text + acceptance checkbox on the verify page */}
      <Card title="Rules Gate" premium>
        {premium === false ? (
          <PremiumLockNote text="💎 Show your server rules right on the verify page — optionally requiring members to accept them before they can verify. A Premium extra." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#949ba4', marginBottom: 6 }}>Rules text</label>
              <p style={{ fontSize: 11.5, color: '#52535a', marginBottom: 8, lineHeight: 1.5 }}>
                Shown in a scrollable box above the verify button. Leave it empty to hide the box.
              </p>
              <textarea value={rulesDraft} maxLength={1500} rows={6}
                onChange={(e) => setRulesDraft(e.target.value.slice(0, 1500))}
                placeholder={'1. Be respectful.\n2. No advertising or scam links.\n3. Follow the Discord Terms of Service.'}
                style={{ ...input, width: '100%', resize: 'vertical', lineHeight: 1.6, whiteSpace: 'pre-wrap' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: rulesDraft.length >= 1500 ? '#f23f43' : '#52535a', fontVariantNumeric: 'tabular-nums' }}>
                  {rulesDraft.length}/1500
                </span>
                {rulesDraft !== (page.rules ?? '') && (
                  <button onClick={() => patch('verify.page.rules', rulesDraft.slice(0, 1500), 'Rules text')}
                    disabled={saving === 'verify.page.rules'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: saving === 'verify.page.rules' ? 0.6 : 1 }}>
                    {saving === 'verify.page.rules' ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Save
                  </button>
                )}
              </div>
            </div>
            <div style={{ paddingTop: 14, borderTop: '1px solid #1e1e22' }}>
              <ToggleSwitch
                checked={!!page.require_accept}
                onChange={(v) => patch('verify.page.require_accept', v, 'Rules acceptance')}
                label="Require accepting the rules"
                description="Members must tick “I have read and accept the rules” before the verify button unlocks."
                disabled={saving === 'verify.page.require_accept'}
              />
            </div>
          </div>
        )}
      </Card>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AgeInput({ value, onSave, saving }: { value: number; onSave: (v: number) => void; saving: boolean }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const dirty = local !== value;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="number" min={0} max={365} value={local}
        onChange={(e) => setLocal(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
        style={{ width: 80, padding: '8px 10px', background: '#18181b', border: `1px solid ${dirty ? '#f0b232' : '#2e2e36'}`, borderRadius: 7, color: '#f2f3f5', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
      {dirty && (
        <button onClick={() => onSave(local)} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#5865f2', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Save
        </button>
      )}
    </div>
  );
}
