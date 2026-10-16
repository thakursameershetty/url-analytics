'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, ExternalLink, Share2, Tag } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { copyToClipboard } from '@/lib/clipboard';
import { CHANNELS } from '@/lib/platform';

const EASE = [0.16, 1, 0.3, 1] as const;

// Share screens that accept a URL; the link is tagged so analytics knows where it went.
const INTENTS: Partial<Record<(typeof CHANNELS)[number]['id'], (u: string) => string>> = {
  whatsapp: (u) => `https://wa.me/?text=${encodeURIComponent(u)}`,
  telegram: (u) => `https://t.me/share/url?url=${encodeURIComponent(u)}`,
  x: (u) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}`,
  linkedin: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
  facebook: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  email: (u) => `mailto:?body=${encodeURIComponent(u)}`,
  sms: (u) => `sms:?&body=${encodeURIComponent(u)}`,
};

export function taggedUrl(url: string, via: string) {
  return `${url}${url.includes('?') ? '&' : '?'}via=${encodeURIComponent(via)}`;
}

/**
 * Popover offering channel-tagged copies of a short link (`?via=whatsapp`…).
 * Chat and email apps don't send a Referer, so tagging is the reliable way to
 * know which channel a click came from. Portalled to <body> with `position: fixed`:
 * the link rows are animated (CSS transforms) and clipped, which would trap a
 * fixed element inside them.
 */
export default function ShareMenu({ url, iconOnly }: { url: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        right: Math.max(16, window.innerWidth - r.right),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function copy(id: string, value: string) {
    if (await copyToClipboard(value)) {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    }
  }

  const customTag = custom
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 32);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={iconOnly ? 'btn-ghost' : 'btn-secondary'}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Share with channel tracking"
        title="Share with channel tracking"
      >
        <Share2 className="size-4" />
        {!iconOnly && 'Share'}
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label="Share link"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: -6,
                  scale: 0.97,
                  transition: { duration: 0.12 },
                }}
                transition={{ duration: 0.25, ease: EASE }}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  right: pos.right,
                  // Never run off the bottom of the screen; scroll inside instead.
                  maxHeight: `calc(100vh - ${pos.top + 16}px)`,
                  transformOrigin: 'top right',
                }}
                className="z-50 w-[min(340px,calc(100vw-32px))] overflow-y-auto overscroll-contain rounded-3xl border border-line bg-[var(--field)] p-3 text-left shadow-[var(--float-focus)]"
              >
                <p className="px-1 text-sm font-medium">Share with tracking</p>
                <p className="mb-3 px-1 text-xs text-muted">
                  Each copy is tagged, so analytics shows exactly where clicks came from — even from apps like WhatsApp.
                </p>

                <div className="space-y-0.5">
                  {CHANNELS.map((c) => {
                    const link = taggedUrl(url, c.id);
                    const intent = INTENTS[c.id];
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-1 rounded-2xl py-0.5 pl-3 pr-1 hover:bg-surface-2"
                      >
                        <span className="flex-1 text-sm">{c.label}</span>
                        <button
                          type="button"
                          className="btn-ghost h-8! px-2.5! text-xs"
                          onClick={() => copy(c.id, link)}
                          aria-label={`Copy ${c.label} link`}
                        >
                          <span className="relative grid size-3.5 place-items-center">
                            <AnimatePresence mode="popLayout" initial={false}>
                              <motion.span
                                key={copied === c.id ? 'y' : 'n'}
                                initial={{ scale: 0.3, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.3, opacity: 0 }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 600,
                                  damping: 24,
                                }}
                                className={copied === c.id ? 'text-good' : ''}
                              >
                                {copied === c.id ? (
                                  <Check className="size-3.5" strokeWidth={2.6} />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </motion.span>
                            </AnimatePresence>
                          </span>
                          {copied === c.id ? 'Copied' : 'Copy'}
                        </button>
                        {/* Keeps the Copy buttons aligned for channels with no share screen. */}
                        {!intent && <span className="w-[34px] shrink-0" aria-hidden />}
                        {intent && (
                          <a
                            href={intent(link)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-ghost h-8! px-2.5! text-xs"
                            aria-label={`Open ${c.label} share screen`}
                            title={`Open ${c.label}`}
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>

                <form
                  className="mt-3 flex items-center gap-2 border-t border-line pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customTag) copy('custom', taggedUrl(url, customTag));
                  }}
                >
                  <label className="input flex h-9! flex-1 items-center gap-2 px-3! shadow-none!">
                    <Tag className="size-3.5 shrink-0 text-muted" />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      placeholder="Custom tag, e.g. poster"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      aria-label="Custom tag"
                    />
                  </label>
                  <button type="submit" className="btn-primary h-9! px-3.5! text-xs" disabled={!customTag}>
                    {copied === 'custom' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied === 'custom' ? 'Copied' : 'Copy'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
