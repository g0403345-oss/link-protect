'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color?: string;
  delay?: number;
}

export default function FeatureCard({
  icon: Icon,
  title,
  description,
  color = '#5865f2',
  delay = 0,
}: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative"
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"
        style={{ backgroundColor: `${color}20` }}
      />

      {/* Card */}
      <div className="relative h-full bg-[#1e1f22]/80 backdrop-blur-sm border border-[#2b2d31] group-hover:border-[#35373c] rounded-2xl p-6 transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(88,101,242,0.15)]">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>

        <h3 className="text-[#f2f3f5] font-semibold text-lg mb-2 group-hover:text-white transition-colors">
          {title}
        </h3>
        <p className="text-[#b5bac1] text-sm leading-relaxed">
          {description}
        </p>

        {/* Bottom accent line */}
        <div
          className="absolute bottom-0 left-6 right-6 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ backgroundColor: color }}
        />
      </div>
    </motion.div>
  );
}
