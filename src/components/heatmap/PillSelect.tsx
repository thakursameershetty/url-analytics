'use client';

import { ChevronDown } from 'lucide-react';

/** Native <select> dressed as a raised pill — keeps keyboard and mobile pickers for free. */
export default function PillSelect({
  value,
  onChange,
  options,
  label,
  icon,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`btn-secondary relative cursor-pointer gap-2! pr-9! ${className}`}>
      {icon && <span className="shrink-0 text-ink-2">{icon}</span>}
      <span className="truncate">{options.find((o) => o.value === value)?.label ?? label}</span>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
