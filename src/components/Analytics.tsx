'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Cpu, Download, Monitor, QrCode, RefreshCw, Share2, Smartphone, Sparkles, Tablet, X } from 'lucide-react';
import type { LinkSummary, Stats } from '@/lib/types';
import BarList from './charts/BarList';
import DonutChart from './charts/DonutChart';
import Heatmap from './charts/Heatmap';
import TimelineChart, { type TimelineSeries } from './charts/TimelineChart';
import WorldMap from './charts/WorldMap';
import { compact, integer, pct } from './charts/shared';
import Modal, { originOf, type Origin } from './Modal';
import CountUp from './motion/CountUp';
import QrStudio, { Segmented } from './QrStudio';
import HeatmapPanel from './HeatmapPanel';
import LinkPicker from './LinkPicker';
import LiveBadge from './LiveBadge';
import { useLive } from './useLive';
import { useOrigin } from './useOrigin';

const RANGES: [string, string][] = [
  ['24h', '24h'],
  ['7d', '7d'],
  ['30d', '30d'],
  ['90d', '90d'],
  ['all', 'All'],
];
const formatCompact = (n: number) => compact.format(Math.round(n));
const RANGE_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };

export function flag(code: string | null | undefined) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

const MAX_COMPARE = 6;

function parseSelection(raw: string | null) {
  return [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
}

/**
 * Give each newly selected link the lowest free colour slot, keeping existing
 * links' colours — so a line never changes colour when you add or remove another.
 */
function assignSlots(prev: Record<string, number>, selected: string[]) {
  const next: Record<string, number> = {};
  for (const id of selected) if (prev[id]) next[id] = prev[id];
  const used = new Set(Object.values(next));
  for (const id of selected) {
    if (next[id]) continue;
    let slot = 1;
    while (used.has(slot) && slot < MAX_COMPARE) slot++;
    next[id] = slot;
    used.add(slot);
  }
  return next;
}

export default function Analytics() {
  const origin = useOrigin();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<string[]>(() => parseSelection(searchParams.get('links')));
  const [range, setRange] = useState(() => {
    const r = searchParams.get('range');
    return r && RANGES.some(([v]) => v === r) ? r : '30d';
  });
  const [slots, setSlots] = useState<Record<string, number>>(() => assignSlots({}, parseSelection(searchParams.get('links'))));
  const [allLinks, setAllLinks] = useState<LinkSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState<Origin | false>(false);
  const [seeding, setSeeding] = useState(false);

  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [pulse, setPulse] = useState(0);
  const statsRef = useRef<Stats | null>(null);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const selectionKey = selected.join(',');

  // Keep the address bar shareable without a navigation (no remount, no refetch of the page).
  useEffect(() => {
    // Slugs are URL-safe ([A-Za-z0-9_-]), so the commas can stay readable instead of %2C.
    const parts: string[] = [];
    if (selectionKey) parts.push(`links=${selectionKey}`);
    if (range !== '30d') parts.push(`range=${range}`);
    const qs = parts.join('&');
    const next = `/analytics${qs ? `?${qs}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [selectionKey, range]);

  function changeSelection(next: string[]) {
    setSelected(next);
    setSlots((prev) => assignSlots(prev, next));
  }

  const loadLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/links', { cache: 'no-store' });
      if (res.ok) setAllLinks((await res.json()).links);
    } catch {}
  }, []);

  /** `silent` refreshes (live updates) skip the loading state and highlight new visits. */
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams({ range });
        if (selectionKey) qs.set('links', selectionKey);
        const res = await fetch(`/api/stats?${qs}`, { cache: 'no-store' });
        const body: (Stats & { error?: string }) | null = await res.json().catch(() => null);
        if (!res.ok || !body) throw new Error(body?.error ?? `Couldn't load analytics (server error ${res.status}).`);
        const prev = statsRef.current;
        if (silent && prev) {
          const seen = new Set(prev.recent.map((v) => v.id));
          const added = body.recent.filter((v) => !seen.has(v.id)).map((v) => v.id);
          if (added.length) {
            setFreshIds(new Set(added));
            setTimeout(() => setFreshIds(new Set()), 2400);
          }
        }
        setStats(body);
        setError(null);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectionKey, range],
  );

  const live = useLive(() => {
    load(true);
    loadLinks();
    setPulse((p) => p + 1);
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLinks();
  }, [loadLinks]);

  async function seed() {
    setSeeding(true);
    await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shortIds: selected, count: 250 }),
    });
    setSeeding(false);
    load(true);
  }

  const colorOf = useCallback((shortId: string) => (slots[shortId] ? `var(--series-${slots[shortId]})` : null), [slots]);

  // Time window for the timeline; "all" starts at the first visit (or first link's creation).
  const span = useMemo(() => {
    if (!stats) return null;
    const end = new Date();
    const days = RANGE_DAYS[stats.range];
    if (days) return { start: new Date(end.getTime() - days * 86_400_000), end, hourly: days === 1 };
    const firstLink = stats.links[0] ? Date.parse(stats.links[0].createdAt) : end.getTime();
    const first = stats.events.length ? stats.events[stats.events.length - 1][0] : firstLink;
    const start = new Date(Math.min(first, end.getTime() - 7 * 86_400_000));
    return { start, end, hourly: false };
  }, [stats]);

  // Compare mode: one line per selected link (2–6 links).
  const series = useMemo<TimelineSeries[] | undefined>(() => {
    if (!stats || stats.mode !== 'multi' || stats.links.length > MAX_COMPARE) return undefined;
    return stats.links.map((l, i) => ({
      index: i,
      label: `/${l.shortId}`,
      color: colorOf(l.shortId) ?? `var(--series-${(i % MAX_COMPARE) + 1})`,
    }));
  }, [stats, colorOf]);

  if (error && !stats) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <p className="font-medium">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => changeSelection([])}>
            View all links
          </button>
          <Link href="/" className="btn-secondary">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </div>
      </div>
    );
  }

  if (!stats || !span) return <AnalyticsSkeleton />;

  const { totals } = stats;
  const top = stats.countries[0];
  const single = stats.mode === 'single' ? stats.links[0] : null;
  const short = single ? `${origin}/${single.shortId}` : '';
  const isDev = process.env.NODE_ENV !== 'production';
  const showLinks = stats.mode !== 'single';

  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-70' : ''}`}>
      <div className="relative z-30 flex flex-wrap items-center gap-2">
        <LinkPicker links={allLinks} selected={selected} onChange={changeSelection} colorOf={colorOf} />
        <Segmented value={range} onChange={setRange} options={RANGES} />
        <div className="ml-auto flex items-center gap-2">
          <LiveBadge status={live} pulse={pulse} />
          <button type="button" className="btn-secondary" onClick={() => load()} aria-label="Refresh" title="Refresh">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {single && (
            <button type="button" className="btn-secondary" onClick={(e) => setQrOpen(originOf(e.currentTarget))}>
              <QrCode className="size-4" /> QR
            </button>
          )}
          {isDev && (
            <button type="button" className="btn-secondary" onClick={seed} disabled={seeding} title="Development only: insert fake visits">
              <Sparkles className="size-4" /> {seeding ? 'Seeding…' : 'Demo data'}
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {single ? (
          <>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{single.title || single.shortId}</h1>
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
              <a href={short} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">
                {short.replace(/^https?:\/\//, '')}
              </a>
              <span className="truncate text-muted">→ {single.originalUrl}</span>
            </p>
          </>
        ) : stats.mode === 'multi' ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Comparing {stats.links.length} links</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {stats.links.map((l) => (
                  <motion.span
                    key={l.shortId}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-[var(--field)] pl-3 pr-1 text-sm shadow-[var(--raise)]"
                  >
                    <span className="size-2.5 rounded-full" style={{ background: colorOf(l.shortId) ?? 'var(--muted)' }} />
                    <span className="font-mono">/{l.shortId}</span>
                    <button
                      type="button"
                      className="grid size-6 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
                      onClick={() => changeSelection(selected.filter((s) => s !== l.shortId))}
                      aria-label={`Remove /${l.shortId}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            {stats.links.length > MAX_COMPARE && (
              <p className="mt-2 text-xs text-muted">Showing combined totals — pick up to {MAX_COMPARE} links to compare them line by line.</p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">All links</h1>
            <p className="text-sm text-muted">
              Combined across {stats.links.length} link{stats.links.length === 1 ? '' : 's'}
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Clicks" value={<CountUp value={totals.clicks} format={formatCompact} />} hero />
        <StatTile label="Unique visitors" value={<CountUp value={totals.uniqueVisitors} format={formatCompact} />} sub="by IP address" />
        <StatTile
          label="QR scans"
          value={<CountUp value={totals.qrScans} format={formatCompact} />}
          sub={`${pct(totals.qrScans, totals.clicks)} of clicks`}
        />
        <StatTile
          label="Top country"
          value={top ? `${flag(top.code)} ${top.key}` : '—'}
          sub={top ? `${pct(top.count, totals.clicks)} of clicks` : undefined}
          small
        />
      </div>

      <Card
        title={series ? 'Clicks over time, by link' : 'Clicks over time'}
        aside={
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-ink-2">
            {series ? (
              series.map((sr) => <LegendKey key={sr.label} color={sr.color} label={sr.label} />)
            ) : (
              <>
                <LegendKey color="var(--series-1)" label="All clicks" />
                <LegendKey color="var(--series-2)" label="QR scans" />
              </>
            )}
          </div>
        }
      >
        <TimelineChart
          key={`${stats.range}|${series ? 'cmp' : 'one'}`}
          events={stats.events}
          start={span.start}
          end={span.end}
          hourly={span.hourly}
          series={series}
        />
        {totals.botsFiltered > 0 && (
          <p className="mt-2 text-xs text-muted">
            {integer.format(totals.botsFiltered)} bot/preview hit{totals.botsFiltered === 1 ? '' : 's'} excluded.
          </p>
        )}
      </Card>

      {single && <HeatmapPanel key={single.shortId} link={single} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Where clicks come from" className="lg:col-span-2" aside={<span className="hidden text-xs text-muted sm:inline">Scroll to zoom · double-click to reset</span>}>
          <WorldMap key={stats.range} points={stats.geo} total={totals.clicks} />
        </Card>
        <Card title="Countries">
          <BarList rows={stats.countries} total={totals.clicks} prefix={countryPrefix(stats)} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Opened from" aside={<span className="text-xs text-muted">App, site or tag</span>}>
          <BarList rows={stats.platforms} total={totals.clicks} limit={7} />
        </Card>
        <Card title="Devices">
          <DonutChart rows={stats.devices} total={totals.clicks} />
        </Card>
        <Card title="Browsers">
          <BarList rows={stats.browsers} total={totals.clicks} limit={6} />
        </Card>
      </div>

      <div className={`grid gap-6 md:grid-cols-2 ${showLinks ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {showLinks && (
          <Card title="Links">
            <BarList rows={stats.byLink.map((r) => ({ ...r, key: `/${r.key}` }))} total={totals.clicks} limit={6} />
          </Card>
        )}
        <Card title="Operating systems">
          <BarList rows={stats.os} total={totals.clicks} limit={6} />
        </Card>
        <Card title="Cities">
          <BarList rows={stats.cities} total={totals.clicks} limit={6} />
        </Card>
        <Card title="Languages">
          <BarList rows={stats.languages} total={totals.clicks} limit={6} />
        </Card>
      </div>

      <Card title="When people click" aside={<span className="text-xs text-muted">Your local time</span>}>
        <Heatmap key={stats.range} events={stats.events} />
      </Card>

      <Card
        title="Recent visits"
        aside={
          stats.recent.length > 0 && (
            <button type="button" className="btn-ghost text-xs" onClick={() => downloadCsv(stats)}>
              <Download className="size-3.5" /> CSV
            </button>
          )
        }
        flush
      >
        <VisitsTable stats={stats} showLink={showLinks} freshIds={freshIds} />
      </Card>

      {single && (
        <Modal open={!!qrOpen} origin={qrOpen || null} onClose={() => setQrOpen(false)} title={`QR code · /${single.shortId}`}>
          <QrStudio url={short} fileName={`qr-${single.shortId}`} />
        </Modal>
      )}
    </div>
  );
}

function countryPrefix(stats: Stats) {
  const codes = new Map(stats.countries.map((c) => [c.key, c.code]));
  return (row: { key: string }) => (row.key === 'Other' ? '🌐' : flag(codes.get(row.key)));
}

function StatTile({ label, value, sub, hero, small }: { label: string; value: React.ReactNode; sub?: string; hero?: boolean; small?: boolean }) {
  return (
    <div className="card fade-up p-4 sm:p-5">
      <div className="text-sm text-ink-2">{label}</div>
      <div className={`mt-1 truncate font-semibold tracking-tight ${hero ? 'text-4xl sm:text-5xl' : small ? 'text-xl sm:text-2xl' : 'text-3xl'}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  aside,
  children,
  className = '',
  flush,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`card fade-up min-w-0 ${flush ? '' : 'p-5'} ${className}`}>
      <div className={`mb-4 flex items-center justify-between gap-3 ${flush ? 'px-5 pt-5' : ''}`}>
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'medium' });

function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dayFmt.format(d);
}

const DEVICE_ICON: Record<string, typeof Monitor> = { Desktop: Monitor, Mobile: Smartphone, Tablet: Tablet };

/**
 * Every cell is the same two-line shape (value + muted detail), never wraps,
 * and truncates with the full text on hover — so all rows share one height.
 */
function Cell({
  primary,
  secondary,
  icon,
  mono,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  const titleOf = (n: React.ReactNode) => (typeof n === 'string' ? n : undefined);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {icon && <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">{icon}</span>}
      <div className="min-w-0 leading-tight">
        <div className={`truncate ${mono ? 'tabular font-mono text-[13px]' : ''}`} title={titleOf(primary)}>
          {primary}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted" title={titleOf(secondary)}>
          {secondary || '\u00a0'}
        </div>
      </div>
    </div>
  );
}

function VisitsTable({ stats, showLink, freshIds }: { stats: Stats; showLink: boolean; freshIds: Set<string> }) {
  if (stats.recent.length === 0) {
    return <p className="px-5 pb-8 pt-2 text-center text-sm text-muted">No visits in this period yet. Share your link!</p>;
  }
  const th = 'px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted';
  return (
    <div>
      {/* Scrolls inside the card; the header row stays pinned. */}
      <div className="max-h-[560px] overflow-auto overscroll-contain">
        <table className="w-full min-w-[920px] table-fixed text-sm">
          <colgroup>
            <col className="w-[112px]" />
            {showLink && <col className="w-[108px]" />}
            <col />
            <col className="w-[150px]" />
            <col className="w-[18%]" />
            <col className="w-[17%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className={`${th} pl-5`}>When</th>
              {showLink && <th className={th}>Link</th>}
              <th className={th}>Location</th>
              <th className={th}>IP address</th>
              <th className={th}>Device</th>
              <th className={th}>Browser</th>
              <th className={`${th} pr-5`}>Opened from</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {stats.recent.map((v) => {
              const at = new Date(v.at);
              const DeviceIcon = DEVICE_ICON[v.device] ?? Cpu;
              const place = [v.region && v.region !== v.city ? v.region : null, v.country].filter(Boolean).join(', ');
              const via = v.referer && v.referer !== 'Direct' && v.referer !== v.platform ? `via ${v.referer}` : null;
              return (
                <tr
                  key={v.id}
                  className={`transition-colors hover:bg-surface-2/60 ${freshIds.has(v.id) ? 'row-flash' : ''}`}
                >
                  <td className="py-3 pl-5 pr-3" title={fullFmt.format(at)}>
                    <Cell primary={dayLabel(at)} secondary={clockFmt.format(at)} />
                  </td>
                  {showLink && (
                    <td className="px-3 py-3">
                      <Cell primary={<span className="font-mono text-accent">/{v.shortId}</span>} />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <Cell
                      icon={<span className="text-sm leading-none">{flag(v.countryCode)}</span>}
                      primary={v.city ?? v.country ?? 'Unknown'}
                      secondary={v.city ? place : undefined}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Cell primary={v.ip ?? '—'} secondary={v.language ?? undefined} mono />
                  </td>
                  <td className="px-3 py-3">
                    <Cell icon={<DeviceIcon className="size-3.5" />} primary={v.device} secondary={v.deviceName ?? undefined} />
                  </td>
                  <td className="px-3 py-3">
                    <Cell primary={v.browser ?? 'Unknown'} secondary={v.os ?? undefined} />
                  </td>
                  <td className="py-3 pl-3 pr-5">
                    <Cell
                      icon={v.source === 'qr' ? <QrCode className="size-3.5" /> : <Share2 className="size-3.5" />}
                      primary={v.platform}
                      secondary={via ?? (v.source === 'qr' ? 'Scanned' : undefined)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {stats.recent.length === 100 && totalsNote(stats)}
    </div>
  );
}

function totalsNote(stats: Stats) {
  return (
    <p className="border-t border-line px-5 py-3 text-xs text-muted">
      Showing the latest 100 of {integer.format(stats.totals.clicks)} visits. Charts above include all of them.
    </p>
  );
}

function downloadCsv(stats: Stats) {
  const cols = ['at', 'shortId', 'ip', 'city', 'region', 'country', 'countryCode', 'device', 'deviceName', 'browser', 'os', 'platform', 'referer', 'language', 'source'] as const;
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = stats.recent.map((v) => cols.map((c) => esc(v[c])).join(','));
  const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `visits-${stats.mode === 'all' ? 'all-links' : stats.links.map((l) => l.shortId).join('_')}-${stats.range}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-14 w-72 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-surface-2" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-2xl bg-surface-2 lg:col-span-2" />
        <div className="h-80 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
