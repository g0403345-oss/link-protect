'use client';

import { motion } from 'framer-motion';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  description?: string;
}

const sizes = {
  sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 16 },
  md: { track: 'w-10 h-5', thumb: 'w-3.5 h-3.5', translate: 20 },
  lg: { track: 'w-12 h-6', thumb: 'w-4.5 h-4.5', translate: 24 },
};

export default function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
}: ToggleSwitchProps) {
  const s = sizes[size];

  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  if (label) {
    return (
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#f2f3f5]">{label}</div>
          {description && (
            <div className="text-xs text-[#6d6f78] mt-0.5">{description}</div>
          )}
        </div>
        <ToggleTrack
          checked={checked}
          disabled={disabled}
          onClick={toggle}
          trackClass={s.track}
          thumbClass={s.thumb}
          translateX={s.translate}
        />
      </div>
    );
  }

  return (
    <ToggleTrack
      checked={checked}
      disabled={disabled}
      onClick={toggle}
      trackClass={s.track}
      thumbClass={s.thumb}
      translateX={s.translate}
    />
  );
}

function ToggleTrack({
  checked,
  disabled,
  onClick,
  trackClass,
  thumbClass,
  translateX,
}: {
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
  trackClass: string;
  thumbClass: string;
  translateX: number;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={`
        relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5865f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1f22]
        ${trackClass}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${checked ? 'bg-[#3ba55d]' : 'bg-[#4e5058]'}
      `}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
        animate={{ x: checked ? translateX - 2 : 2 }}
        className={`${thumbClass} bg-white rounded-full shadow-md`}
        style={{ position: 'absolute', left: 0 }}
      />
    </button>
  );
}
