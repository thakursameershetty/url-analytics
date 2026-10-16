'use client';

import { motion } from 'motion/react';

/** Pill toggle: recessed track, raised thumb that springs across. */
export default function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-surface-2 shadow-[inset_0_1px_3px_rgba(16,24,40,0.15)]'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 32 }}
        className={`size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25),0_2px_6px_-1px_rgba(0,0,0,0.2)] ${checked ? 'ml-auto' : ''}`}
      />
    </button>
  );
}
