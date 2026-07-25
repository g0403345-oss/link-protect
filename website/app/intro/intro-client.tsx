'use client';

/**
 * /intro — an Apple-launch-style animated presentation of Link Protect.
 * No video file: eight timed scenes with big typography and spring motion,
 * a story progress bar, click/tap to advance, Esc/skip to the end card.
 * prefers-reduced-motion (or ?still) jumps straight to the final card.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  ShieldAlert, Siren, UserCheck, Radar, RotateCcw, X, Gift, Bug, Link2,
} from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const BOT_INVITE = 'https://discord.com/oauth2/authorize?client_id=888390889892892684&permissions=1376805547126&integration_type=0&scope=bot';

/* scene durations in ms — cuts first, then room to breathe */
const SCENES = [2700, 2400, 3400, 5400, 4800, 3400, 3000, 3000] as const;
const LAST = SCENES.length; // end card (untimed)

/* ── shared pieces ────────────────────────────────────────────── */

function BigWord({ children, delay = 0, color = '#f2f3f5', size = 'clamp(44px, 9vw, 110px)' }: {
  children: React.ReactNode; delay?: number; color?: string; size?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 34, scale: 1.18, filter: 'blur(12px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
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

/* the real Link Protect logo as an app-icon tile with glow */
function LogoTile({ size = 128, delay = 0 }: { size?: number; delay?: number }) {
  return (
    <motion.div initial={{ scale: 0.35, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 170, damping: 15, delay }}
      style={{ position: 'relative', display: 'inline-block' }}>
      {/* shockwave ring */}
      <motion.span initial={{ scale: 0.6, opacity: 0.7 }} animate={{ scale: 2.6, opacity: 0 }}
        transition={{ duration: 1.1, delay: delay + 0.18, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: -6, borderRadius: '32%', border: '2px solid rgba(88,101,242,0.7)' }} />
      <motion.span initial={{ scale: 0.6, opacity: 0.5 }} animate={{ scale: 3.6, opacity: 0 }}
        transition={{ duration: 1.5, delay: delay + 0.3, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: -6, borderRadius: '40%', border: '1px solid rgba(88,101,242,0.5)' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="Link Protect" width={size} height={size}
        style={{ borderRadius: size * 0.26, boxShadow: '0 26px 90px rgba(88,101,242,0.55), 0 0 0 1px rgba(255,255,255,0.08)', display: 'block' }} />
    </motion.div>
  );
}

/* Scene 3: a scam message gets deleted live */
function MockupScene() {
  const [phase, setPhase] = useState(0); // 0 typing, 1 posted, 2 deleted
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 700);
    const t2 = setTimeout(() => setPhase(2), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div style={{ width: 'min(560px, 92vw)', textAlign: 'left' }}>
      <BigWord size="clamp(28px, 5vw, 44px)">Gone before anyone clicks.</BigWord>
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
        style={{ position: 'relative', marginTop: 26, background: '#313338', borderRadius: 14, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
        {/* red flash when the scam gets zapped */}
        <AnimatePresence>
          {phase === 2 && (
            <motion.div key="flash" initial={{ opacity: 0.5 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'rgba(242,63,67,0.25)', pointerEvents: 'none' }} />
          )}
        </AnimatePresence>
        <AnimatePresence mode="popLayout">
          {phase < 2 ? (
            <motion.div key="scam" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: 60, filter: 'blur(8px)', transition: { duration: 0.32 } }}
              style={{ display: 'flex', gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f0b232', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#111', flexShrink: 0 }}>S</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f2f3f5' }}>Scammy <span style={{ fontSize: 11, color: '#6d6f78', fontWeight: 500 }}>today at 9:41</span></div>
                <div style={{ fontSize: 14, color: '#dbdee1', marginTop: 2, minHeight: 20 }}>
                  {phase >= 1 ? (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      free nitro for everyone 🎁 <span style={{ color: '#96a4ff', textDecoration: 'underline' }}>discord-nltro.gift/claim</span>
                    </motion.span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', paddingTop: 5 }}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#6d6f78', animation: `lp-typing 1s ${i * 0.18}s ease-in-out infinite` }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="warn" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }} style={{ display: 'flex', gap: 11 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="" width={36} height={36} style={{ borderRadius: '50%', flexShrink: 0 }} />
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

/* Scene 4: full-frame rapid cuts, one feature per beat */
const FEATURES = [
  { icon: ShieldAlert, label: 'Scam Shield', sub: 'Catches cross-channel scam blitzes', color: '#eb459e' },
  { icon: Radar, label: 'Raid defense', sub: 'Stops hijacked accounts mid-raid', color: '#f0b232' },
  { icon: UserCheck, label: 'Verification gate', sub: 'Bots never make it past the door', color: '#23a55a' },
  { icon: Siren, label: 'Emergency lockdown', sub: 'Freeze everything with one tap', color: '#f23f43' },
];

function MontageScene() {
  const [cut, setCut] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCut((c) => Math.min(FEATURES.length - 1, c + 1)), 1150);
    return () => clearInterval(id);
  }, []);
  const f = FEATURES[cut];
  const Icon = f.icon;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* full-frame color wash per cut */}
      <AnimatePresence mode="wait">
        <motion.div key={cut} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
          style={{ position: 'absolute', inset: 0, background: `radial-gradient(70% 60% at 50% 55%, ${f.color}26, transparent 70%)` }} />
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.div key={cut}
          initial={{ opacity: 0, scale: 1.25, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
          transition={{ duration: 0.34, ease: EASE }}
          style={{ textAlign: 'center', position: 'relative' }}>
          <span style={{ display: 'inline-flex', width: 84, height: 84, borderRadius: 24, background: `${f.color}18`, border: `1px solid ${f.color}50`, alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 70px ${f.color}40`, marginBottom: 24 }}>
            <Icon size={38} color={f.color} />
          </span>
          <div style={{ fontSize: 'clamp(34px, 6.5vw, 68px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f2f3f5', lineHeight: 1.05 }}>{f.label}</div>
          <div style={{ fontSize: 'clamp(14px, 2vw, 19px)', color: f.color, fontWeight: 600, marginTop: 12 }}>{f.sub}</div>
        </motion.div>
      </AnimatePresence>
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
      const p = Math.min(1, (t - start) / 2200);
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
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(${color} ${score * 3.6}deg, #1a1a1e 0deg)`, filter: `drop-shadow(0 0 34px ${color}55)`, transition: 'filter 0.3s' }} />
        <div style={{ position: 'absolute', inset: 13, borderRadius: '50%', background: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-0.04em', color }}>{score}</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: '#52535a' }}>SECURITY SCORE</span>
        </div>
        {score === 100 && (
          <motion.span initial={{ scale: 0.9, opacity: 0.8 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${color}` }} />
        )}
      </div>
      <BigWord size="clamp(24px, 4.2vw, 40px)" delay={0.2}><span style={{ display: 'inline-block', marginTop: 30 }}>Know exactly how safe you are.</span></BigWord>
    </div>
  );
}

/* Scene 6: live network numbers */
function StatsScene({ stats }: { stats: { servers: number; warned: number } }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const q = Math.min(1, (t - start) / 1800);
      setP(1 - Math.pow(1 - q, 3));
      if (q < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{ textAlign: 'center' }}>
      <Sub>Right now, across the Link Protect network:</Sub>
      <div style={{ display: 'flex', gap: 'clamp(28px, 6vw, 70px)', justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'clamp(48px, 9vw, 96px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#5865f2', lineHeight: 1 }}>
            {Math.round(stats.servers * p).toLocaleString('en-US')}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#949ba4', marginTop: 10, letterSpacing: '0.04em' }}>SERVERS PROTECTED</div>
        </div>
        <div>
          <div style={{ fontSize: 'clamp(48px, 9vw, 96px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f0b232', lineHeight: 1 }}>
            {Math.round(stats.warned * p).toLocaleString('en-US')}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#949ba4', marginTop: 10, letterSpacing: '0.04em' }}>THREATS STOPPED</div>
        </div>
      </div>
    </div>
  );
}

/* Scene 7: night watch — starfield + struck-through scams */
function SleepScene() {
  const stars = useRef(Array.from({ length: 18 }, (_, i) => ({
    left: (i * 53 + 11) % 100, top: (i * 37 + 7) % 88, s: 1 + (i % 3), d: (i % 5) * 0.6,
  }))).current;
  return (
    <>
      {stars.map((st, i) => (
        <span key={i} aria-hidden style={{ position: 'fixed', left: `${st.left}%`, top: `${st.top}%`, width: st.s, height: st.s, borderRadius: '50%', background: '#f2f3f5', opacity: 0.5, animation: `lp-twinkle 2.4s ${st.d}s ease-in-out infinite` }} />
      ))}
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 26 }}>
          {[Gift, Bug, Link2].map((I, i) => (
            <motion.span key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: [0, 1, 1, 0], y: [16, 0, 0, -10] }}
              transition={{ duration: 2, delay: i * 0.2, times: [0, 0.25, 0.7, 1] }}
              style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 13, background: 'rgba(242,63,67,0.1)', border: '1px solid rgba(242,63,67,0.3)', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <I size={19} color="#f23f43" />
              <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.3, delay: 1 + i * 0.2 }}
                style={{ position: 'absolute', left: 4, right: 4, height: 2.5, background: '#f23f43', borderRadius: 2, transformOrigin: 'left' }} />
            </motion.span>
          ))}
        </div>
        <BigWord size="clamp(30px, 5.6vw, 60px)">While you sleep.</BigWord>
        <BigWord size="clamp(30px, 5.6vw, 60px)" delay={0.55} color="#23a55a">It doesn&apos;t.</BigWord>
      </div>
    </>
  );
}

/* ── the player ───────────────────────────────────────────────── */

export default function IntroClient() {
  const [scene, setScene] = useState(0);
  const [stats, setStats] = useState({ servers: 1200, warned: 48000 }); // fallbacks
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jumpEnd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setScene(LAST);
  }, []);

  // live numbers for the stats scene
  useEffect(() => {
    fetch('/api/stats').then((r) => r.json())
      .then((d) => { if (d && !d.error && d.servers) setStats({ servers: d.servers, warned: d.warned ?? 0 }); })
      .catch(() => {});
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
      {/* ambient drifting glows — alive in every scene */}
      <div aria-hidden style={{ position: 'absolute', width: '55vmax', height: '55vmax', borderRadius: '50%', background: 'radial-gradient(circle, rgba(88,101,242,0.14), transparent 65%)', top: '-18vmax', left: '-12vmax', animation: 'lp-drift-a 16s ease-in-out infinite alternate' }} />
      <div aria-hidden style={{ position: 'absolute', width: '48vmax', height: '48vmax', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,127,240,0.1), transparent 65%)', bottom: '-20vmax', right: '-14vmax', animation: 'lp-drift-b 19s ease-in-out infinite alternate' }} />
      <div aria-hidden className="noise" style={{ position: 'absolute', inset: 0 }} />

      {/* story progress */}
      {scene < LAST && (
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5, width: 'min(440px, 80vw)', zIndex: 5 }}>
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
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.26 } }}
            transition={{ duration: 0.3 }}>

            {scene === 0 && (
              <div style={{ position: 'relative' }}>
                {/* color flashes matched to each word */}
                {[['#f23f43', 0.1], ['#f0b232', 0.75], ['#6d6f78', 1.4]].map(([c, dl], i) => (
                  <motion.div key={i} aria-hidden initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0] }}
                    transition={{ duration: 0.7, delay: dl as number }}
                    style={{ position: 'fixed', inset: 0, background: `radial-gradient(60% 50% at 50% 50%, ${c}22, transparent 70%)`, pointerEvents: 'none' }} />
                ))}
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
                <LogoTile size={128} delay={0.15} />
                <BigWord size="clamp(34px, 6.5vw, 72px)" delay={0.45}><span style={{ display: 'inline-block', marginTop: 28 }}>Link Protect.</span></BigWord>
                <Sub delay={0.8}>The bodyguard between your members and every bad link.</Sub>
              </div>
            )}

            {scene === 3 && <MockupScene />}
            {scene === 4 && <MontageScene />}
            {scene === 5 && <ScoreScene />}
            {scene === 6 && <StatsScene stats={stats} />}
            {scene === 7 && <SleepScene />}

            {scene === LAST && (
              <div>
                <LogoTile size={92} />
                <BigWord size="clamp(36px, 7vw, 80px)"><span style={{ display: 'inline-block', marginTop: 24 }}>Link Protect</span></BigWord>
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

      <style>{`
        @keyframes lp-story { from { width: 0 } to { width: 100% } }
        @keyframes lp-typing { 0%, 100% { opacity: 0.25; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-2px) } }
        @keyframes lp-twinkle { 0%, 100% { opacity: 0.15 } 50% { opacity: 0.8 } }
        @keyframes lp-drift-a { from { transform: translate(0, 0) } to { transform: translate(9vmax, 6vmax) } }
        @keyframes lp-drift-b { from { transform: translate(0, 0) } to { transform: translate(-8vmax, -5vmax) } }
      `}</style>
    </div>
  );
}
