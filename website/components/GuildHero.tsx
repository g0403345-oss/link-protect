'use client';

/**
 * Command-center header for a guild dashboard (redesign points 1, 2 and 9):
 * blurred giant server icon as a per-server "banner", a mood glow that shifts
 * with the server state (calm green / recent-threat orange / lockdown red),
 * an animated security-score ring with a percentile line, live status chips
 * and quick actions. Pure client component — everything it shows comes from
 * props the dashboard already loads, plus one lockdown fetch.
 */

import { useEffect, useMemo, useState } from 'react';
import { Shield, ShieldAlert, Siren, Radar, ArrowRight, Activity } from 'lucide-react';
import { scoreItems } from '@/components/SecurityScore';
import type { ServerData, GuildStats } from '@/lib/db';

interface GuildAction { action: string; reason: string; timestamp: number; }

const LEVELS: { min: number; label: string; color: string }[] = [
  { min: 90, label: 'Excellent', color: '#23a55a' },
  { min: 70, label: 'Well protected', color: '#5865f2' },
  { min: 40, label: 'Needs attention', color: '#f0b232' },
  { min: 0, label: 'At risk', color: '#f23f43' },
];

function relTime(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  // Animate the ring from 0 to the score on mount.
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDeg(score * 3.6));
    return () => cancelAnimationFrame(id);
  }, [score]);
  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `conic-gradient(${color} ${deg}deg, #1e1e22 0deg)`,
        transition: 'background 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
      }} />
      <div style={{ position: 'absolute', inset: 7, borderRadius: '50%', background: '#0e0e11', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: '#52535a', letterSpacing: '0.1em', marginTop: 2 }}>SCORE</span>
      </div>
    </div>
  );
}

export default function GuildHero({ guildId, name, icon, data, stats, actions, onNavigate }: {
  guildId: string;
  name: string;
  icon: string | null | undefined;
  data: ServerData;
  stats: GuildStats | null;
  actions: GuildAction[];
  onNavigate: (section: string) => void;
}) {
  const [lockdown, setLockdown] = useState(false);
  const [premium, setPremium] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/guild/${guildId}/premium`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setPremium(!!d.active); })
      .catch(() => {});
    fetch(`/api/guild/${guildId}/lockdown`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setLockdown(!!d.active); })
      .catch(() => {});
    return () => { alive = false; };
  }, [guildId]);

  const items = useMemo(() => scoreItems(data), [data]);
  const score = items.reduce((s, i) => s + (i.met ? i.points : 0), 0);
  const level = LEVELS.find((l) => score >= l.min)!;
  const firstTodo = items.find((i) => !i.met);
  // Rough network percentile from the score curve — most servers never touch
  // their settings, so a configured server climbs fast. Labeled as estimate.
  const percentile = Math.min(99, Math.max(8, Math.round(score * 0.9 + 6)));

  // Mood: lockdown → red · threat caught in the last 24 h → orange ·
  // barely-configured server → amber "Setup incomplete" · else green.
  const now = Math.floor(Date.now() / 1000);
  const recentThreat = actions.some((a) =>
    a.timestamp > now - 86400 &&
    (a.action === 'banned' || /scam shield|raid/i.test(a.reason ?? '')));
  const setupIncomplete = !lockdown && !recentThreat && score < 40;
  const mood = lockdown ? '#f23f43' : recentThreat ? '#f0b232' : setupIncomplete ? '#f0b232' : '#23a55a';
  const moodLabel = lockdown ? 'Lockdown active' : recentThreat ? 'Threat handled in the last 24h' : setupIncomplete ? 'Setup incomplete' : 'All calm';
  const MoodIcon = lockdown ? Siren : (recentThreat || setupIncomplete) ? ShieldAlert : Shield;

  const iconUrl = icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.webp?size=256` : null;

  const chip = (label: React.ReactNode, color: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', fontSize: 12, fontWeight: 600, color, background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 99 }}>
      {label}
    </span>
  );

  return (
    <div style={{ position: 'relative', borderRadius: 16, border: '1px solid #1e1e22', overflow: 'hidden', background: '#0e0e11' }}>
      {/* Banner backdrop: the server's own icon blown up + blurred, so every
          dashboard carries its server's branding without needing a banner. */}
      {iconUrl && (
        <div aria-hidden style={{
          position: 'absolute', inset: -40, backgroundImage: `url(${iconUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(48px) saturate(1.15)', opacity: 0.22, transform: 'translateZ(0)',
        }} />
      )}
      {/* Mood glow — the dashboard's "state color" at a glance */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(560px circle at 12% 0%, ${mood}1f, transparent 60%)`, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,10,12,0.25), rgba(10,10,12,0.82))', pointerEvents: 'none' }} />

      <div className="guild-hero-inner" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 22, padding: '22px 24px', flexWrap: 'wrap' }}>
        {/* Identity */}
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" style={{ width: 64, height: 64, borderRadius: 18, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={28} color="#fff" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: '#f2f3f5', lineHeight: 1.15, marginBottom: 8 }}>{name}</h1>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {chip(<><MoodIcon size={12} /> {moodLabel}</>, mood)}
            {premium && chip(<>💎 Premium</>, '#96a4ff')}
            {actions[0] && chip(<>Last action {relTime(actions[0].timestamp)}</>, '#949ba4')}
          </div>
          {/* One clear next step — everything else lives in its own tab */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {score < 50 ? (
              <button onClick={() => onNavigate('blockers')} className="btn-primary btn-sm" style={{ fontSize: 12.5 }}>
                Finish setup — 1-click preset <ArrowRight size={12} />
              </button>
            ) : firstTodo ? (
              <button onClick={() => onNavigate(firstTodo.section)} className="btn-primary btn-sm" style={{ fontSize: 12.5 }}>
                {firstTodo.label} <span style={{ opacity: 0.75 }}>+{firstTodo.points}</span> <ArrowRight size={12} />
              </button>
            ) : (
              <button onClick={() => onNavigate('scamshield')} className="btn-primary btn-sm" style={{ fontSize: 12.5 }}>
                <Radar size={13} /> Scan members
              </button>
            )}
            {/* Secondary action: member scan only once Scam Shield is on —
                otherwise the most useful quick win is picking a log channel. */}
            {firstTodo && (
              data.scamguard?.enabled ? (
                <button onClick={() => onNavigate('scamshield')} className="btn-secondary btn-sm" style={{ fontSize: 12.5 }}>
                  <Radar size={13} /> Scan members
                </button>
              ) : !data.log?.['log-channel'] ? (
                <button onClick={() => onNavigate('log')} className="btn-secondary btn-sm" style={{ fontSize: 12.5 }}>
                  <Activity size={13} /> Set a log channel
                </button>
              ) : null
            )}
          </div>
        </div>

        {/* Score ring + percentile */}
        <div className="guild-hero-score" style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <ScoreRing score={score} color={level.color} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: level.color }}>{level.label}</div>
            <div style={{ fontSize: 12, color: '#949ba4', marginTop: 3, maxWidth: 170, lineHeight: 1.5 }}>
              Safer than <b style={{ color: '#f2f3f5' }}>~{percentile}%</b> of Discord servers<span style={{ color: '#52535a' }}> (est.)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
