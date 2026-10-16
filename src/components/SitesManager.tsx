'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Check, Copy, Flame, Globe, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { useOrigin } from './useOrigin';

const EASE = [0.16, 1, 0.3, 1] as const;

interface SiteRow {
  id: string;
  key: string;
  name: string;
  domain: string;
  createdAt: string;
  lastSeenAt: string | null;
  pageViews7d: number;
  pageViews: number;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export default function SitesManager() {
  const origin = useOrigin();
  const prefill = useSearchParams().get('domain') ?? '';
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState(prefill);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/sites', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setSites((await res.json()).sites);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // While a site is waiting for its first visit, check every few seconds so "Installed" appears by itself.
  const waiting = sites?.some((s) => !s.lastSeenAt) ?? false;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [waiting, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    const res = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, domain }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setAdding(false);
    if (!res?.ok) {
      setError(body?.error ?? 'Could not add the site');
      return;
    }
    setName('');
    setDomain('');
    setFresh(body.site.id);
    await load();
  }

  async function remove(id: string) {
    setSites((s) => s?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/sites/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Add a website you own and paste one line into its HTML. You&apos;ll get click heatmaps, scroll maps, and rage and dead
            clicks — joined to the short link, channel and device each visitor came from.
          </p>
        </div>

        <form
          onSubmit={add}
          className="composer py-1.5! pl-5! max-sm:grid! max-sm:grid-cols-[20px_1fr] max-sm:gap-x-3! max-sm:gap-y-1! max-sm:rounded-3xl! max-sm:p-3! max-sm:pl-4!"
        >
          <DomainIcon domain={domain} />
          <input
            className="composer-input min-w-0"
            placeholder="Your website, e.g. example.com"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              if (error) setError(null);
            }}
            aria-label="Website domain"
            autoComplete="url"
            required
          />
          <span className="hidden h-7 w-px shrink-0 bg-[var(--border)] sm:block" aria-hidden />
          <input
            className="composer-input text-sm! max-sm:col-span-2 max-sm:h-11! max-sm:border-t max-sm:border-[var(--border)] max-sm:pl-8 sm:w-44 sm:flex-none"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            aria-label="Site name"
          />
          <button type="submit" className="btn-primary h-12 shrink-0 px-6 max-sm:col-span-2 max-sm:mt-1 max-sm:h-11" disabled={adding || !domain.trim()}>
            <Plus className="size-4" /> {adding ? 'Adding…' : 'Add site'}
          </button>
        </form>
        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="-mt-5 px-6 text-sm text-critical">
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {!sites && <div className="shimmer h-48 rounded-2xl" />}

        {sites && sites.length === 0 && (
          <div className="card grid place-items-center gap-2 px-6 py-14 text-center">
            <Globe className="float size-8 text-muted" />
            <p className="font-medium">No sites yet</p>
            <p className="max-w-sm text-sm text-muted">Add the domain of a website you control to start collecting heatmaps.</p>
          </div>
        )}

        <div className="space-y-4">
          <AnimatePresence initial={false} mode="popLayout">
            {sites?.map((s) => (
              <SiteCard key={s.id} site={s} origin={origin} fresh={fresh === s.id} onDelete={() => remove(s.id)} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}

function SiteCard({ site, origin, fresh, onDelete }: { site: SiteRow; origin: string; fresh: boolean; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const snippet = `<script defer src="${origin}/s.js" data-site="${site.key}"></script>`;
  const installed = !!site.lastSeenAt;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
      className={`card p-5 ${fresh ? 'row-flash' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{site.name}</h2>
          <p className="font-mono text-sm text-muted">{site.domain}</p>
        </div>
        <div className="flex items-center gap-2">
          {installed ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-[var(--field)] px-3 text-xs font-medium text-ink-2 shadow-[var(--raise)]">
              <Check className="size-3.5 text-good" strokeWidth={3} /> Installed · seen {ago(site.lastSeenAt!)}
            </span>
          ) : (
            <span className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-[var(--field)] px-3 text-xs font-medium text-ink-2 shadow-[var(--raise)]">
              <span className="relative grid size-2 place-items-center">
                <span className="live-ping absolute inset-0 rounded-full bg-[var(--muted)]" style={{ animationIterationCount: 'infinite' }} />
                <span className="relative size-2 rounded-full bg-[var(--muted)]" />
              </span>
              Waiting for the first visit
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs text-muted">
          Paste this just before <code className="font-mono">&lt;/head&gt;</code> on every page of {site.domain}
        </p>
        <div className="flex items-center gap-2 rounded-2xl bg-surface-2 py-1.5 pl-4 pr-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2" title={snippet}>
            {snippet}
          </code>
          <button
            type="button"
            className="btn-secondary h-8! shrink-0 px-3! text-xs"
            onClick={async () => {
              if (await copyToClipboard(snippet)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }
            }}
          >
            {copied ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{site.pageViews7d.toLocaleString('en')}</span> page views in the last 7 days ·{' '}
          {site.pageViews.toLocaleString('en')} total
        </p>
        <div className="flex items-center gap-2">
          <Link href={`/heatmaps?site=${site.key}`} className={`btn-primary ${installed ? '' : 'pointer-events-none opacity-50'}`}>
            <Flame className="size-4" /> Open heatmaps
          </Link>
          <button
            type="button"
            className={`btn-ghost ${armed ? 'bg-critical! text-white!' : 'hover:text-critical!'}`}
            onClick={() => (armed ? onDelete() : setArmed(true))}
            onBlur={() => setArmed(false)}
            aria-label={armed ? 'Confirm delete site' : 'Delete site'}
          >
            <Trash2 className="size-4" />
            {armed && <span className="text-xs">Delete site & data?</span>}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

/** Globe until the input looks like a domain, then that site's favicon. */
function DomainIcon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  let host: string | null = null;
  try {
    const v = domain.trim();
    const h = v ? new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`).hostname : '';
    host = /\.[a-z]{2,}$/i.test(h) ? h : null;
  } catch {}
  return (
    <span className="grid size-5 shrink-0 place-items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {host && failed !== host ? (
          <motion.img
            key={host}
            src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
            alt=""
            width={18}
            height={18}
            className="size-[18px] rounded"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            onError={() => setFailed(host)}
          />
        ) : (
          <motion.span key="globe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted">
            <Globe className="size-[18px]" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
