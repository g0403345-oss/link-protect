'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useInView } from 'framer-motion';

interface StatCounterProps {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  color?: string;
  duration?: number;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) {
    return n.toLocaleString('en-US');
  }
  return n.toString();
}

export default function StatCounter({
  value,
  label,
  suffix = '',
  prefix = '',
  color = '#5865f2',
  duration = 2,
}: StatCounterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { duration: duration * 1000, bounce: 0 });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (inView) {
      motionVal.set(value);
    }
  }, [inView, value, motionVal]);

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      setDisplay(formatNumber(Math.round(v)));
    });
    return unsub;
  }, [spring]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center text-center group"
    >
      {/* Glow ring */}
      <div
        className="relative w-24 h-24 mb-4 flex items-center justify-center"
      >
        <div
          className="absolute inset-0 rounded-full opacity-20 group-hover:opacity-40 transition-opacity duration-300 blur-lg"
          style={{ backgroundColor: color }}
        />
        <div
          className="absolute inset-0 rounded-full border-2 opacity-30"
          style={{ borderColor: color }}
        />
        <div
          className="absolute inset-2 rounded-full"
          style={{ backgroundColor: `${color}15` }}
        />
        <span
          className="relative text-2xl font-black"
          style={{ color }}
        >
          {prefix}{display}{suffix}
        </span>
      </div>

      <div className="text-[#f2f3f5] font-semibold text-base">{label}</div>

      {/* Shimmer underline */}
      <div
        className="mt-2 h-0.5 w-12 rounded-full opacity-60"
        style={{ backgroundColor: color }}
      />
    </motion.div>
  );
}

export function SimpleStatCounter({
  value,
  label,
  color = '#5865f2',
}: {
  value: number;
  label: string;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { duration: 1800, bounce: 0 });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (inView) motionVal.set(value);
  }, [inView, value, motionVal]);

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      setDisplay(formatNumber(Math.round(v)));
    });
    return unsub;
  }, [spring]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-black mb-2" style={{ color }}>
        {display}
      </div>
      <div className="text-[#b5bac1] text-sm font-medium">{label}</div>
    </div>
  );
}
