'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Layers, Link2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LinkSummary } from '@/lib/types';
import { compact } from './charts/shared';

const EASE = [0.16, 1, 0.3, 1] as const;

interface Props {
  links: LinkSummary[];
  /** Selected slugs; empty means "all links". */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Colour slot per selected slug, so the picker matches the chart lines. */
  colorOf: (shortId: string) => string | null;
}

/** Pill trigger + popover for choosing one, several, or all links. */
export default function LinkPicker({ links, selected, onChange, colorOf }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (l) =>
        l.shortId.toLowerCase().includes(q) ||
        l.originalUrl.toLowerCase().includes(q) ||
        (l.title ?? '').toLowerCase().includes(q),
    );
  }, [links, query]);

  const selectedSet = new Set(selected);
  const isAll = selected.length === 0;

  function toggle(shortId: string) {
    onChange(selectedSet.has(shortId) ? selected.filter((s) => s !== shortId) : [...selected, shortId]);
  }

  const label = isAll
    ? 'All links'
    : selected.length === 1
      ? `/${selected[0]}`
      : `${selected.length} links`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn-secondary max-w-[240px]"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isAll ? <Layers className="size-4 shrink-0" /> : <Link2 className="size-4 shrink-0" />}
        <span className={`truncate ${selected.length === 1 ? 'font-mono' : ''}`}>{label}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="inline-flex shrink-0 text-muted">
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ transformOrigin: 'top left' }}
            className="absolute left-0 top-full z-40 mt-2 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-line bg-[var(--field)] p-2 shadow-[var(--float-focus)]"
            role="listbox"
            aria-multiselectable
          >
            <label className="relative mb-2 block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                className="input h-10! pl-10! text-sm shadow-none!"
                placeholder="Search links"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            <PickerRow
              active={isAll}
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              radio
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
                <Layers className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">All links</span>
                <span className="block text-xs text-muted">
                  {links.length} link{links.length === 1 ? '' : 's'} combined
                </span>
              </span>
            </PickerRow>

            <div className="my-1.5 h-px bg-[var(--border)]" />
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Pick one or more to compare
            </div>

            <div className="max-h-[300px] overflow-y-auto overscroll-contain">
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No links match</p>}
              {filtered.map((l) => {
                const on = selectedSet.has(l.shortId);
                const color = on ? colorOf(l.shortId) : null;
                return (
                  <PickerRow key={l.id} active={on} onClick={() => toggle(l.shortId)}>
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-md border transition ${on ? 'border-transparent bg-accent text-accent-ink' : 'border-[var(--edge-strong)]'}`}
                    >
                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                          >
                            <Check className="size-3.5" strokeWidth={3} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.title || l.shortId}</span>
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono text-accent">/{l.shortId}</span>
                        {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted">
                      <span className="tabular block font-medium text-ink-2">{compact.format(l.clicks)}</span>
                      clicks
                    </span>
                    <button
                      type="button"
                      className="only-btn btn-ghost h-7! px-2.5! text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange([l.shortId]);
                        setOpen(false);
                      }}
                    >
                      Only
                    </button>
                  </PickerRow>
                );
              })}
            </div>

            {!isAll && (
              <div className="mt-1.5 flex items-center justify-between border-t border-line px-2 pt-2">
                <span className="text-xs text-muted">{selected.length} selected</span>
                <button type="button" className="btn-ghost h-8! text-xs" onClick={() => onChange([])}>
                  Clear
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PickerRow({
  active,
  onClick,
  radio,
  children,
}: {
  active: boolean;
  onClick: () => void;
  radio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`picker-row group flex cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-sm transition-colors ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
    >
      {children}
      {radio && active && <Check className="size-4 shrink-0 text-accent" />}
    </div>
  );
}
