'use client';

/**
 * DashboardTour — a lightweight, dependency-free guided product tour.
 *
 * It walks a first-time user through every dashboard tab, switching the active
 * section as it goes (via `onSectionChange`) and spotlighting the relevant
 * control. Targets are matched by a `data-tour="<id>"` attribute on the page.
 * If a target isn't present (e.g. a tab whose data hasn't loaded), the step
 * gracefully falls back to a centred tooltip.
 */

import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface TourStep {
  /** Section to switch the dashboard to before showing this step. */
  section?: string;
  /** `data-tour` value of the element to spotlight. Omit for a centred step. */
  selector?: string;
  title: string;
  body: string;
  /** Preferred tooltip side relative to the target. */
  placement?: 'auto' | 'right';
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Link Protect 👋',
    body: "Let's take a quick tour of your dashboard — about 60 seconds. Every change here saves automatically; there's no Save button to hunt for. You can skip anytime and re-open this from the “Tour” button at the top.",
  },
  {
    selector: 'nav',
    placement: 'right',
    title: 'Your navigation',
    body: 'This sidebar is how you move around. Each tab controls one part of your protection. We’ll go through them one by one.',
  },
  {
    section: 'overview',
    selector: 'overview-stats',
    title: 'Overview — the big picture',
    body: 'See warnings issued, how many members were warned, and how many blockers are active right now. The chips below show exactly which protections are live on your server.',
  },
  {
    section: 'blockers',
    selector: 'blockers',
    title: 'Link Blockers — the core',
    body: 'Flip a toggle to block that type of link. “Block All Links” is the master switch — it overrides everything else. “Malware / Phishing” uses live threat feeds. Every toggle saves the instant you flip it.',
  },
  {
    section: 'blockers',
    selector: 'silent',
    title: 'Silent Mode',
    body: 'Deletes bad links without a public callout — the user just gets a private DM, and the warning is still counted behind the scenes. Great for keeping chat clean and drama-free.',
  },
  {
    section: 'blockers',
    selector: 'raid',
    title: 'Raid Protection',
    body: 'If many members suddenly post the same link in seconds — a raid or hijacked accounts — the bot deletes the messages and times out the accounts automatically, with one alarm instead of dozens of warnings. Off by default; tune the trigger to your server.',
  },
  {
    section: 'warnings',
    selector: 'thresholds',
    title: 'Warning thresholds',
    body: 'Decide what happens to repeat offenders: how many warnings trigger a Kick, a Ban, or a Timeout. Set any value to 0 to disable that action entirely.',
  },
  {
    section: 'warnings',
    selector: 'decay',
    title: 'Warning decay',
    body: 'Automatically forgive old warnings after a set number of days, so one old mistake doesn’t haunt a member forever. Leave it off to keep warnings until you reset them manually.',
  },
  {
    section: 'channelrules',
    selector: 'channelrules',
    title: 'Channel Rules',
    body: 'Make individual channels behave differently from the rest of the server — for example, allow links in #links-only while blocking them everywhere else.',
  },
  {
    section: 'access',
    selector: 'access',
    title: 'Access Control',
    body: 'Your whitelist: channels, categories, members, or roles that bypass all link checks. You can also grant trusted people dashboard access here — without giving them admin rights in Discord.',
  },
  {
    section: 'access',
    selector: 'allowlist',
    title: 'Trusted domains',
    body: 'Allowlist specific domains you trust — they bypass blocking, including the malware/phishing scanner. Perfect for killing false positives on a site your community uses a lot.',
  },
  {
    section: 'blacklist',
    selector: 'blacklist',
    title: 'Custom Blacklist',
    body: 'Add any domain or URL here and it’s blocked instantly, on top of the built-in threat feeds. Type it in and press Enter (or Add).',
  },
  {
    section: 'stats',
    selector: 'stats',
    title: 'Statistics',
    body: 'Your moderation history — total warnings, your most-warned members, and trend charts over time. Hit the refresh icon to pull the latest numbers.',
  },
  {
    section: 'log',
    selector: 'log',
    title: 'Activity Log',
    body: 'A live moderation feed — every warn, kick, ban and timeout as it happens, auto-refreshing every 5 seconds. Above it you can pick a Discord channel to mirror these logs into.',
  },
  {
    section: 'audit',
    selector: 'audit',
    title: 'Audit Log',
    body: 'Tracks who changed which setting and when — whether from this dashboard, the mobile app, or slash commands. Full accountability for your whole team.',
  },
  {
    title: "That's the tour! 🎉",
    body: 'Everything saves automatically. You can re-open this walkthrough anytime from the “Tour” button at the top. Happy moderating!',
  },
];

const ACCENT = '#5865f2';
const TOOLTIP_W = 340;
const PAD = 6;

// Avoid the SSR "useLayoutEffect does nothing on the server" warning.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface Props {
  run: boolean;
  onClose: () => void;
  onSectionChange: (section: string) => void;
}

export default function DashboardTour({ run, onClose, onSectionChange }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  const total = STEPS.length;
  const step = STEPS[i];

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (run) setI(0); }, [run]);

  // On step change: switch section, then measure + scroll the target into view.
  useEffect(() => {
    if (!run) return;
    if (step.section) onSectionChange(step.section);
    let raf = 0;
    const measure = () => {
      if (!step.selector) { setRect(null); return; }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.selector}"]`);
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setRect(r.width === 0 && r.height === 0 ? null : r);
      });
    };
    const t = setTimeout(measure, step.section ? 360 : 80);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, i]);

  // Keep the spotlight glued to the target through scrolls / resizes.
  useEffect(() => {
    if (!run || !step.selector) return;
    const reflow = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.selector}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width || r.height) setRect(r);
    };
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, i]);

  // Position the tooltip once we know both the target rect and the tooltip size.
  useIsoLayoutEffect(() => {
    if (!run) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = tipRef.current?.offsetHeight ?? 180;
    const w = TOOLTIP_W;
    if (!rect) {
      setPos({ top: Math.max(24, vh / 2 - h / 2), left: vw / 2 - w / 2 });
      return;
    }
    let left: number;
    let top: number;
    if (step.placement === 'right' && rect.right + w + 16 < vw) {
      left = rect.right + 16;
      top = Math.min(Math.max(16, rect.top), vh - h - 16);
    } else {
      left = Math.min(Math.max(16, rect.left), vw - w - 16);
      top = rect.bottom + h + 16 < vh ? rect.bottom + 14 : Math.max(16, rect.top - h - 14);
    }
    setPos({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, i, run]);

  const handleNext = useCallback(() => {
    if (i >= total - 1) onClose();
    else setI(i + 1);
  }, [i, total, onClose]);
  const handleBack = useCallback(() => setI((p) => Math.max(0, p - 1)), []);

  // Keyboard navigation.
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      else if (e.key === 'ArrowLeft') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, handleNext, handleBack, onClose]);

  if (!run || !mounted) return null;

  return createPortal(
    // The container itself covers the screen and swallows page clicks, so the
    // user can only interact with the tooltip while the tour is open.
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      {rect ? (
        <motion.div
          initial={false}
          animate={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{
            position: 'fixed',
            borderRadius: 12,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 2px ${ACCENT}`,
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)' }} />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          ref={tipRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: TOOLTIP_W,
            maxWidth: 'calc(100vw - 32px)',
            background: '#18181b',
            border: '1px solid #2e2e36',
            borderRadius: 14,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            padding: 18,
            zIndex: 1001,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Step {i + 1} of {total}
            </span>
            <button onClick={onClose} aria-label="Close tour"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52535a', display: 'flex', padding: 2 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f2f3f5')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#52535a')}>
              <X size={16} />
            </button>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#f2f3f5', marginBottom: 6, letterSpacing: '-0.01em' }}>{step.title}</h3>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#b5bac1' }}>{step.body}</p>

          <div style={{ display: 'flex', gap: 4, margin: '14px 0' }}>
            {STEPS.map((_, j) => (
              <span key={j} style={{ height: 4, flex: 1, borderRadius: 99, background: j <= i ? ACCENT : '#2e2e36', transition: 'background 0.2s' }} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={onClose}
              style={{ fontSize: 12, fontWeight: 500, color: '#6d6f78', background: 'none', border: 'none', cursor: 'pointer' }}>
              Skip tour
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {i > 0 && (
                <button onClick={handleBack}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#b5bac1', background: '#232329', border: '1px solid #2e2e36', borderRadius: 8, cursor: 'pointer' }}>
                  <ChevronLeft size={14} /> Back
                </button>
              )}
              <button onClick={handleNext}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: ACCENT, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                {i === total - 1 ? 'Finish' : 'Next'}
                {i < total - 1 && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}
