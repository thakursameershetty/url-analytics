'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, MotionConfig, motion, useAnimationControls } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  QrCode,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import type { LinkSummary } from '@/lib/types';
import Sparkline from './charts/Sparkline';
import { compact } from './charts/shared';
import Modal, { originOf, type Origin } from './Modal';
import QrStudio from './QrStudio';
import CountUp from './motion/CountUp';
import MiniQr from './motion/MiniQr';
import ScrambleText from './motion/ScrambleText';
import ShareMenu from './ShareMenu';
import Switch from './Switch';
import LiveBadge from './LiveBadge';
import { useLive } from './useLive';
import { useOrigin } from './useOrigin';

// Expo-out: fast start, long gentle settle. Used everywhere so motion feels like one system.
const EASE = [0.16, 1, 0.3, 1] as const;
const formatCompact = (n: number) => compact.format(Math.round(n));

export default function LinksHome() {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
      <LinksHomeInner />
    </MotionConfig>
  );
}

function LinksHomeInner() {
  const origin = useOrigin();
  const missing = useSearchParams().get('missing');

  const [links, setLinks] = useState<LinkSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [title, setTitle] = useState('');
  const [forwardUtm, setForwardUtm] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [qr, setQr] = useState<{ link: LinkSummary; origin: Origin | null } | null>(null);
  const [query, setQuery] = useState('');
  const [missingDismissed, setMissingDismissed] = useState(false);
  // Rows stagger in on first load only; later additions/removals animate individually.
  const [staggerIn, setStaggerIn] = useState(true);
  const shake = useAnimationControls();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/links', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setLinks((await res.json()).links);
      setLoadError(null);
    } catch {
      setLoadError('Could not load your links.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // New clicks, scans and links from anywhere show up without a reload.
  const [pulse, setPulse] = useState(0);
  const live = useLive(() => {
    refresh();
    setPulse((p) => p + 1);
  });

  const hasLinks = links !== null;
  useEffect(() => {
    if (!hasLinks) return;
    const t = setTimeout(() => setStaggerIn(false), 1500);
    return () => clearTimeout(t);
  }, [hasLinks]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setFormError(null);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, alias, title, forwardUtm }),
      });
      const body = await res.json();
      if (!res.ok) {
        fail(body.error ?? 'Something went wrong');
        return;
      }
      setStatus('done');
      setCreated(body.link.shortId);
      setFresh(body.link.id);
      setUrl('');
      setAlias('');
      setTitle('');
      await refresh();
      setTimeout(() => setStatus('idle'), 1400);
      setTimeout(() => setFresh(null), 2200);
    } catch {
      fail('Network error — is the server running?');
    }
  }

  function fail(message: string) {
    setStatus('idle');
    setFormError(message);
    shake.start({ x: [0, -8, 7, -5, 3, 0], transition: { duration: 0.42, ease: 'easeOut' } });
  }

  async function onDelete(link: LinkSummary) {
    setLinks((ls) => ls?.filter((l) => l.id !== link.id) ?? null);
    if (created === link.shortId) setCreated(null);
    const res = await fetch(`/api/links/${encodeURIComponent(link.shortId)}`, { method: 'DELETE' });
    if (!res.ok) refresh();
  }

  const filtered = useMemo(() => {
    if (!links) return null;
    const q = query.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (l) =>
        l.shortId.toLowerCase().includes(q) ||
        l.originalUrl.toLowerCase().includes(q) ||
        (l.title ?? '').toLowerCase().includes(q),
    );
  }, [links, query]);

  const createdLink = links?.find((l) => l.shortId === created) ?? null;
  const totalClicks = links?.reduce((s, l) => s + l.clicks, 0) ?? 0;
  const totalScans = links?.reduce((s, l) => s + l.qrScans, 0) ?? 0;

  return (
    <div className="space-y-10">
      <AnimatePresence>
        {missing && !missingDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
          >
            <TriangleAlert className="size-4 shrink-0 text-critical" />
            <span className="flex-1">
              No link found for <code className="font-mono">/{missing}</code>. It may have been deleted.
            </span>
            <button type="button" className="btn-ghost" onClick={() => setMissingDismissed(true)} aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="mx-auto max-w-3xl pt-4 text-center sm:pt-10">
        <Headline />

        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6, ease: EASE }}
          className="mt-10 text-left"
        >
          <motion.div animate={shake} className="composer">
            <UrlIcon url={url} />
            <input
              className="composer-input"
              placeholder="Paste a long link — e.g. example.com/a/very/long/path"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (formError) setFormError(null);
              }}
              aria-label="URL to shorten"
              autoFocus
              required
            />
            <SubmitButton status={status} disabled={status !== 'idle' || !url.trim()} />
          </motion.div>

          <AnimatePresence>
            {formError && (
              <motion.p
                key={formError}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-6 text-sm text-critical"
              >
                <span className="block pt-3">{formError}</span>
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setShowOptions((s) => !s)}
              className="btn-ghost text-xs"
              aria-expanded={showOptions}
            >
              Custom alias & title
              <motion.span animate={{ rotate: showOptions ? 180 : 0 }} className="inline-flex">
                <ChevronDown className="size-3.5" />
              </motion.span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showOptions && (
              <motion.div
                key="options"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="overflow-hidden"
              >
                {/* Padding gives the pills' shadows room inside the clipped wrapper. */}
                <div className="grid gap-3 px-2 pb-4 pt-2 sm:grid-cols-2">
                  <label className="input flex items-center gap-0.5">
                    <span className="shrink-0 font-mono text-sm text-muted">{origin.replace(/^https?:\/\//, '')}/</span>
                    <input
                      className="min-w-0 flex-1 bg-transparent font-mono outline-none"
                      placeholder="my-alias"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      maxLength={40}
                      aria-label="Custom alias"
                    />
                  </label>
                  <input
                    className="input"
                    placeholder="Title (optional)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    aria-label="Title"
                  />
                  <label className="flex cursor-pointer items-center gap-3 px-2 pt-1 text-sm sm:col-span-2">
                    <Switch checked={forwardUtm} onChange={setForwardUtm} label="Add UTM tags on redirect" />
                    <span>
                      Add UTM tags on redirect
                      <span className="block text-xs text-muted">
                        So Clarity or Google Analytics on the destination can split heatmaps by this link.
                      </span>
                    </span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.form>
      </section>

      <AnimatePresence mode="wait">
        {createdLink && (
          <ResultCard
            key={createdLink.id}
            link={createdLink}
            origin={origin}
            onQr={(el) => setQr({ link: createdLink, origin: originOf(el) })}
            onDismiss={() => setCreated(null)}
          />
        )}
      </AnimatePresence>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: EASE }}
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Your links</h2>
            {links && (
              <p className="text-sm text-muted">
                <CountUp value={links.length} /> link{links.length === 1 ? '' : 's'} ·{' '}
                <CountUp value={totalClicks} format={formatCompact} /> clicks ·{' '}
                <CountUp value={totalScans} format={formatCompact} /> QR scans
              </p>
            )}
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <LiveBadge status={live} pulse={pulse} />
          {links && links.length > 3 && (
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
              <input
                className="input h-10! pl-10! text-sm"
                placeholder="Search links"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          )}
          </div>
        </div>

        {loadError && <p className="text-sm text-critical">{loadError}</p>}

        {!filtered && !loadError && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-[76px] rounded-2xl" />
            ))}
          </div>
        )}

        {filtered && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card grid place-items-center gap-2 px-6 py-14 text-center"
          >
            <QrCode className="float size-8 text-muted" />
            <p className="font-medium">{links?.length ? 'No links match that search' : 'No links yet'}</p>
            <p className="text-sm text-muted">
              {links?.length ? 'Try a different term.' : 'Shorten your first URL above to start tracking clicks.'}
            </p>
          </motion.div>
        )}

        {filtered && filtered.length > 0 && (
          <ul className="card overflow-hidden">
            <AnimatePresence initial={true} mode="popLayout">
              {filtered.map((l, i) => (
                <LinkRow
                  key={l.id}
                  link={l}
                  index={i}
                  stagger={staggerIn}
                  fresh={fresh === l.id}
                  origin={origin}
                  onQr={(el) => setQr({ link: l, origin: originOf(el) })}
                  onDelete={() => onDelete(l)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </motion.section>

      <Modal
        open={!!qr}
        origin={qr?.origin}
        onClose={() => setQr(null)}
        title={qr ? `QR code · /${qr.link.shortId}` : 'QR code'}
      >
        {qr && <QrStudio url={shortUrl(origin, qr.link.shortId)} fileName={`qr-${qr.link.shortId}`} />}
      </Modal>
    </div>
  );
}

export function shortUrl(origin: string, shortId: string) {
  return `${origin}/${shortId}`;
}

/* ───────────────────────── Hero ───────────────────────── */

function Headline() {
  const words: [string, boolean][] = [
    ['URL', false],
    ['Shortener', true],
  ];
  return (
    <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
      {words.map(([w, accent], i) => (
        <span key={w} className={`inline-block ${accent ? 'text-accent' : ''}`}>
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.08 * i, duration: 0.7, ease: EASE }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? '\u00a0' : ''}
        </span>
      ))}
    </h1>
  );
}

/** Link icon that swaps to the destination's favicon once the input looks like a URL. */
function UrlIcon({ url }: { url: string }) {
  const host = useMemo(() => {
    const v = url.trim();
    if (!v) return null;
    try {
      const h = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`).hostname;
      return /\.[a-z]{2,}$/i.test(h) ? h : null;
    } catch {
      return null;
    }
  }, [url]);
  const [failedHost, setFailedHost] = useState<string | null>(null);

  return (
    <span className="pointer-events-none grid size-5 shrink-0 place-items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {host && failedHost !== host ? (
          <motion.img
            key={host}
            src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
            alt=""
            width={18}
            height={18}
            className="size-[18px] rounded"
            initial={{ opacity: 0, scale: 0.4, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            onError={() => setFailedHost(host)}
          />
        ) : (
          <motion.span
            key="icon"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className={host ? 'text-accent' : 'text-muted'}
          >
            <Link2 className="size-[18px]" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function SubmitButton({ status, disabled }: { status: 'idle' | 'loading' | 'done'; disabled: boolean }) {
  return (
    <motion.button
      type="submit"
      layout
      whileTap={{ scale: 0.96 }}
      className={`btn-primary h-12! min-w-[132px] shrink-0 overflow-hidden px-6! text-sm! ${status === 'done' ? 'bg-good! opacity-100!' : ''}`}
      disabled={disabled}
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {status === 'idle' && (
          <motion.span
            key="idle"
            className="flex items-center gap-1.5"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
          >
            Shorten
            <ArrowRight className="nudge size-4" />
          </motion.span>
        )}
        {status === 'loading' && (
          <motion.span
            key="loading"
            className="flex items-center gap-2"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
          >
            <span className="spinner" /> Shortening
          </motion.span>
        )}
        {status === 'done' && (
          <motion.span
            key="done"
            className="flex items-center gap-1.5"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          >
            <Check className="size-4" strokeWidth={3} /> Done
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ───────────────────────── Result ───────────────────────── */

function ResultCard({
  link,
  origin,
  onQr,
  onDismiss,
}: {
  link: LinkSummary;
  origin: string;
  onQr: (el: Element) => void;
  onDismiss: () => void;
}) {
  const full = shortUrl(origin, link.shortId);
  return (
    <motion.section
      initial={{ opacity: 0, height: 0, y: -12 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0, y: -12 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto max-w-3xl overflow-hidden"
    >
      <div className="card relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <button type="button" onClick={onDismiss} className="btn-ghost absolute right-2 top-2" aria-label="Dismiss">
          <X className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <SuccessTick />
            Your short link is ready
          </div>
          <div className="mt-2 truncate font-mono text-xl font-medium sm:text-2xl">
            <span className="text-muted">{origin.replace(/^https?:\/\//, '')}/</span>
            <ScrambleText text={link.shortId} className="text-accent" />
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-1 truncate text-sm text-muted"
          >
            → {link.originalUrl}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-4 flex flex-wrap gap-2"
          >
            <CopyButton text={full} primary />
            <ShareMenu url={full} />
            <button type="button" className="btn-secondary" onClick={(e) => onQr(e.currentTarget)}>
              <QrCode className="size-4" /> Customize QR
            </button>
            <Link href={`/analytics?links=${link.shortId}`} className="btn-secondary">
              <BarChart3 className="size-4" /> Analytics
            </Link>
          </motion.div>
        </div>

        <button
          type="button"
          onClick={(e) => onQr(e.currentTarget)}
          className="group mx-auto shrink-0 rounded-2xl border border-line p-2 transition hover:-translate-y-0.5 hover:shadow-lg sm:mr-6"
          aria-label="Open QR code"
        >
          <MiniQr value={`${full}?src=qr`} size={112} />
          <span className="mt-1 block text-center text-[11px] text-muted transition group-hover:text-ink">
            Click to customize
          </span>
        </button>
      </div>
    </motion.section>
  );
}

/** Circle + checkmark that draw themselves in. */
function SuccessTick() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-good" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      />
      <motion.path
        d="M7.5 12.5l3 3 6-6.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.35, duration: 0.35, ease: EASE }}
      />
    </svg>
  );
}

/* ───────────────────────── List ───────────────────────── */

function LinkRow({
  link: l,
  index,
  stagger,
  fresh,
  origin,
  onQr,
  onDelete,
}: {
  link: LinkSummary;
  index: number;
  stagger: boolean;
  fresh: boolean;
  origin: string;
  onQr: (el: Element) => void;
  onDelete: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: stagger ? 10 : -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -32, transition: { duration: 0.22, ease: 'easeIn' } }}
      transition={{
        delay: stagger ? 0.5 + Math.min(index, 10) * 0.05 : 0,
        duration: 0.45,
        ease: EASE,
        layout: { duration: 0.35, ease: EASE },
      }}
      className={`link-row grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_96px_88px_auto] sm:px-5 ${fresh ? 'row-flash' : ''}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Favicon url={l.originalUrl} />
          <Link href={`/analytics?links=${l.shortId}`} className="row-title truncate font-medium">
            {l.title || l.shortId}
          </Link>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm">
          <span className="shrink-0 font-mono text-accent">/{l.shortId}</span>
          <span className="truncate text-muted">→ {l.originalUrl.replace(/^https?:\/\/(www\.)?/, '')}</span>
        </div>
      </div>
      <div className="hidden sm:block" title="Clicks, last 14 days">
        <Sparkline values={l.spark} />
      </div>
      <div className="text-right sm:text-left">
        <CountUp value={l.clicks} format={formatCompact} className="font-semibold" />
        <div className="text-xs text-muted">
          clicks{l.qrScans > 0 && <> · {compact.format(l.qrScans)} QR</>}
        </div>
      </div>
      <div className="row-actions col-span-2 flex items-center gap-0.5 sm:col-span-1">
        <CopyButton text={shortUrl(origin, l.shortId)} />
        <ShareMenu url={shortUrl(origin, l.shortId)} iconOnly />
        <button type="button" className="btn-ghost" onClick={(e) => onQr(e.currentTarget)} aria-label="QR code" title="QR code">
          <QrCode className="size-4" />
        </button>
        <Link href={`/analytics?links=${l.shortId}`} className="btn-ghost" aria-label="Analytics" title="Analytics">
          <BarChart3 className="size-4" />
        </Link>
        <a href={l.originalUrl} target="_blank" rel="noreferrer" className="btn-ghost" aria-label="Open destination" title="Open destination">
          <ExternalLink className="size-4" />
        </a>
        <DeleteButton onConfirm={onDelete} />
      </div>
    </motion.li>
  );
}

/** Two-step delete: first click arms it (expands to "Delete?"), second click deletes. */
function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <motion.button
      type="button"
      layout
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`btn-ghost overflow-hidden ${armed ? 'bg-critical! text-white!' : 'hover:text-critical!'}`}
      aria-label={armed ? 'Confirm delete' : 'Delete'}
      title={armed ? 'Click again to delete' : 'Delete'}
      transition={{ layout: { duration: 0.25, ease: EASE } }}
    >
      <motion.span layout="position" className="flex items-center gap-1.5">
        <Trash2 className="size-4" />
        <AnimatePresence initial={false}>
          {armed && (
            <motion.span
              key="confirm"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap text-xs font-medium"
            >
              Delete?
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </motion.button>
  );
}

function CopyButton({ text, primary }: { text: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      className={primary ? 'btn-primary min-w-[96px]' : 'btn-ghost'}
      aria-label="Copy short link"
      title="Copy short link"
      onClick={async () => {
        if (await copyToClipboard(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }
      }}
    >
      <span className="relative grid size-4 place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={copied ? 'check' : 'copy'}
            initial={{ scale: 0.3, opacity: 0, rotate: copied ? -45 : 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 24 }}
            className={`grid place-items-center ${copied && !primary ? 'text-good' : ''}`}
          >
            {copied ? <Check className="size-4" strokeWidth={2.6} /> : <Copy className="size-4" />}
          </motion.span>
        </AnimatePresence>
      </span>
      {primary && (copied ? 'Copied' : 'Copy')}
    </motion.button>
  );
}

function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {}
  if (!host || failed) return <span className="row-icon size-4 shrink-0 rounded bg-surface-2" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
      alt=""
      width={16}
      height={16}
      className="row-icon size-4 shrink-0 rounded"
      onError={() => setFailed(true)}
    />
  );
}
