'use client';

/**
 * /intro — an Apple-launch-style animated presentation of Link Protect.
 * No video file: seven timed scenes with big typography and spring motion,
 * a story progress bar, click/tap to advance, Esc/skip to the end card.
 * prefers-reduced-motion (or ?still) jumps straight to the final card.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  Shield, ShieldAlert, Siren, UserCheck, Radar, RotateCcw, X, Gift, Bug, Link2,
} from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const BOT_INVITE = 'https://discord.com/oauth2/authorize?client_id=888390889892892684&permissions=1376805547126&integration_type=0&scope=bot';

/* scene durations in ms — tuned like cuts, short punches then room to breathe */
const SCENES = [2600, 2600, 3600, 5400, 4600, 3400, 2400] as const;
const LAST = SCENES.length; // index of the end card (not timed)

/* ── tiny building blocks ─────────────────────────────────────── */

function BigWord({ children, delay = 0, color = '#f2f3f5', size = 'clamp(44px, 9vw, 110px)' }: {
  children: React.ReactNode; delay?: number; color?: string; size?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 34, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      style={{ fontSize: size, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1.02, color }}>
      {children}
    </motion.div>
  );
}

function Sub({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      style={{ fontSize: 'clamp(15px, 2.2vw, 20px)', color: '#949ba4', marginTop: 18, lineHeight: 1.5 }}>
      {children}
    </motion.p>
  );
}

/* Scene 3: a scam message gets deleted live */
function MockupScene() {
  const [phase, setPhase] = useState(0); // 0 typing, 1 posted, 2 deleted
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 700);
    const t2 = setTimeout(() => setPhase(2), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div style={{ width: 'min(560px, 92vw)', textAlign: 'left' }}>
      <BigWord size="clamp(28px, 5vw, 44px)">Gone before anyone clicks.</BigWord>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
        style={{ marginTop: 26, background: '#313338', borderRadius: 14, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
        {/* scammer message */}
        <AnimatePresence mode="popLayout">
          {phase < 2 ? (
            <motion.div key="scam" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: 40, filter: 'blur(6px)', transition: { duration: 0.3 } }}
              style={{ display: 'flex', gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f0b232', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#111', flexShrink: 0 }}>S</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f2f3f5' }}>Scammy <span style={{ fontSize: 11, color: '#6d6f78', fontWeight: 500 }}>today at 9:41</span></div>
                <div style={{ fontSize: 14, color: '#dbdee1', marginTop: 2 }}>
                  {phase >= 1 ? <>free nitro for everyone 🎁 <span style={{ color: '#96a4ff', textDecoration: 'underline' }}>discord-nltro.gift/claim</span></> : <span style={{ color: '#6d6f78' }}>typing…</span>}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="warn" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }} style={{ display: 'flex', gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Shield size={17} color="#fff" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f2f3f5' }}>Link Protect <span style={{ fontSize: 9.5, fontWeight: 800, background: '#5865f2', color: '#fff', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' }}>BOT</span></div>
                <div style={{ marginTop: 6, borderLeft: '3px solid #f0b232', background: '#2b2d31', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f2f3f5' }}>🔗 Link Blocked</div>
                  <div style={{ fontSize: 12.5, color: '#b5bac1', marginTop: 3 }}>@Scammy — your message was removed.<br /><b>Reason:</b> Fake Nitro scam link</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <Sub delay={0.4}>Detected, deleted and warned — in under a second.</Sub>
    </div>
  );
}

/* Scene 4: feature montage */
const FEATURES = [
  { icon: ShieldAlert, label: 'Scam Shield', color: '#eb459e' },
  { icon: Radar, label: 'Raid defense', color: '#f0b232' },
  { icon: UserCheck, label: 'Verification gate', color: '#23a55a' },
  { icon: Siren, label: 'Emergency lockdown', color: '#f23f43' },
];

function MontageScene() {
  return (
    <div style={{ textAlign: 'center' }}>
      <BigWord size="clamp(26px, 4.6vw, 42px)">Built for the worst day.</BigWord>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 34, alignItems: 'center' }}>
        {FEATURES.map((f, i) => (
          <motion.div key={f.label}
            initial={{ opacity: 0, x: i % 2 ? 60 : -60, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.5, delay: 0.5 + i * 1.05, ease: EASE }}
            style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: 14, background: `${f.color}16`, border: `1px solid ${f.color}40`, alignItems: 'center', justifyContent: 'center' }}>
              <f.icon size={21} color={f.color} />
            </span>
            <span style={{ fontSize: 'clamp(22px, 3.6vw, 34px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#f2f3f5' }}>{f.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* Scene 5: score ring counts up */
function ScoreScene() {
  const [score, setScore] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 2400);
      setScore(Math.round(100 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const color = score >= 90 ? '#23a55a' : score >= 70 ? '#5865f2' : '#f0b232';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 190, height: 190, margin: '0 auto' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${color} ${score * 3.6}deg, #1a1a1e 0deg)`, filter: `drop-shadow(0 0 34px ${color}55)` }} />
        <div style={{ position: 'absolute', inset: 13, borderRadius: '50%', background: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-0.04em', color }}>{score}</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#52535a' }}>SECURITY SCORE</span>
        </div>
      </div>
      <BigWord size="clamp(24px, 4.2vw, 40px)" delay={0.2}><span style={{ display: 'inline-block', marginTop: 30 }}>Know exactly how safe you are.</span></BigWord>
    </div>
  );
}

/* ── the player ───────────────────────────────────────────────── */

export default function IntroClient() {
  const [scene, setScene] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jumpEnd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setScene(LAST);
  }, []);

  // reduced motion (or ?still) → straight to the end card
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || new URLSearchParams(window.location.search).has('still');
    if (still) setScene(LAST);
  }, []);

  // auto-advance
  useEffect(() => {
    if (scene >= LAST) return;
    timer.current = setTimeout(() => setScene((s) => s + 1), SCENES[scene]);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [scene]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') jumpEnd(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jumpEnd]);

  const advance = () => setScene((s) => Math.min(LAST, s + 1));

  return (
    <div onClick={scene < LAST ? advance : undefined}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#050506', overflow: 'hidden', cursor: scene < LAST ? 'pointer' : 'default', userSelect: 'none' }}>
      {/* ambient glow */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 45% at 50% 118%, rgba(88,101,242,0.16), transparent 65%)' }} />

      {/* story progress */}
      {scene < LAST && (
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5, width: 'min(420px, 80vw)', zIndex: 5 }}>
          {SCENES.map((d, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
              {i === scene && (
                <div style={{ height: '100%', background: '#f2f3f5', borderRadius: 99, width: 0, animation: `lp-story ${d}ms linear forwards` }} />
              )}
              {i < scene && <div style={{ height: '100%', background: '#f2f3f5', borderRadius: 99 }} />}
            </div>
          ))}
        </div>
      )}

      {/* skip / close */}
      <div style={{ position: 'absolute', top: 14, right: 16, zIndex: 5, display: 'flex', gap: 8 }}>
        {scene < LAST && (
          <button onClick={(e) => { e.stopPropagation(); jumpEnd(); }}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#949ba4', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 99, cursor: 'pointer' }}>
            Skip
          </button>
        )}
        <Link href="/" onClick={(e) => e.stopPropagation()} aria-label="Close"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, color: '#949ba4', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%' }}>
          <X size={14} />
        </Link>
      </div>

      {/* scenes */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <AnimatePresence mode="wait">
          <motion.div key={scene}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.28 } }}
            transition={{ duration: 0.3 }}>

            {scene === 0 && (
              <div>
                <BigWord delay={0.1} color="#f23f43">Scams.</BigWord>
                <BigWord delay={0.75} color="#f0b232">Raids.</BigWord>
                <BigWord delay={1.4} color="#6d6f78">Spam.</BigWord>
              </div>
            )}

            {scene === 1 && (
              <div>
                <BigWord>Your server</BigWord>
                <BigWord delay={0.5}>deserves better.</BigWord>
              </div>
            )}

            {scene === 2 && (
              <div>
                <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 170, damping: 15, delay: 0.15 }}
                  style={{ display: 'inline-flex', width: 120, height: 120, borderRadius: 34, background: 'linear-gradient(145deg, #5865f2, #3d47c9)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 26px 90px rgba(88,101,242,0.5)' }}>
                  <Shield size={58} color="#fff" strokeWidth={2.2} />
                </motion.div>
                <BigWord size="clamp(34px, 6.5vw, 72px)" delay={0.45}><span style={{ display: 'inline-block', marginTop: 28 }}>Link Protect.</span></BigWord>
                <Sub delay={0.8}>The bodyguard between your members and every bad link.</Sub>
              </div>
            )}

            {scene === 3 && <MockupScene />}
            {scene === 4 && <MontageScene />}
            {scene === 5 && <ScoreScene />}

            {scene === 6 && (
              <div>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 26 }}>
                  {[Gift, Bug, Link2].map((I, i) => (
                    <motion.span key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: [0, 1, 1, 0], y: [16, 0, 0, -10] }}
                      transition={{ duration: 1.8, delay: i * 0.18, times: [0, 0.25, 0.7, 1] }}
                      style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 13, background: 'rgba(242,63,67,0.1)', border: '1px solid rgba(242,63,67,0.3)', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      <I size={19} color="#f23f43" />
                      <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.3, delay: 0.9 + i * 0.18 }}
                        style={{ position: 'absolute', left: 4, right: 4, height: 2.5, background: '#f23f43', borderRadius: 2, transformOrigin: 'left' }} />
                    </motion.span>
                  ))}
                </div>
                <BigWord size="clamp(30px, 5.6vw, 60px)">While you sleep.</BigWord>
                <BigWord size="clamp(30px, 5.6vw, 60px)" delay={0.55} color="#23a55a">It doesn&apos;t.</BigWord>
              </div>
            )}

            {scene === LAST && (
              <div>
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 160, damping: 16 }}
                  style={{ display: 'inline-flex', width: 84, height: 84, borderRadius: 24, background: 'linear-gradient(145deg, #5865f2, #3d47c9)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 70px rgba(88,101,242,0.45)', marginBottom: 24 }}>
                  <Shield size={40} color="#fff" strokeWidth={2.2} />
                </motion.div>
                <BigWord size="clamp(36px, 7vw, 80px)">Link Protect</BigWord>
                <Sub delay={0.3}>Scam links, raids and spam — handled automatically. <b style={{ color: '#23a55a' }}>Free forever.</b></Sub>
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5, ease: EASE }}
                  style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 30, flexWrap: 'wrap' }}>
                  <a href={BOT_INVITE} target="_blank" rel="noreferrer" className="btn-primary">Add to Discord — free</a>
                  <Link href="/dashboard" className="btn-secondary">Open dashboard</Link>
                  <button onClick={() => setScene(0)} className="btn-secondary" style={{ gap: 7 }}>
                    <RotateCcw size={14} /> Replay
                  </button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {scene < LAST && (
        <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: '#3e3f47', zIndex: 5 }}>
          Click to continue · Esc to skip
        </div>
      )}

      <style>{`@keyframes lp-story { from { width: 0 } to { width: 100% } }`}</style>
    </div>
  );
}
