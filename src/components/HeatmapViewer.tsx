'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import { FileText, Flame, Globe, Link2, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { compact, pct } from './charts/shared';
import HeatmapStage, { heatColor, type ClickPoint, type HeatMode } from './heatmap/HeatmapStage';
import PillSelect from './heatmap/PillSelect';
import LiveBadge from './LiveBadge';
import CountUp from './motion/CountUp';
import { Segmented } from './QrStudio';
import { useLive } from './useLive';

const EASE = [0.16, 1, 0.3, 1] as const;
const RANGES: [string, string][] = [
  ['24h', '24h'],
  ['7d', '7d'],
  ['30d', '30d'],
  ['all', 'All'],
];
const MODES: [string, string][] = [
  ['clicks', 'Clicks'],
  ['scroll', 'Scroll depth'],
  ['frustration', 'Rage & dead clicks'],
];
const DEVICES = ['Desktop', 'Tablet', 'Mobile'];

interface SiteOption {
  key: string;
  name: string;
  domain: string;
  lastSeenAt: string | null;
}

interface HeatmapData {
  site: { key: string; name: string; domain: string };
  range: string;
  path: string;
  device: string;
  pages: { path: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  links: { shortId: string; sessions: number }[];
  platforms: { platform: string; sessions: number }[];
  snapshot: { width: number; height: number; updatedAt: string } | null;
  totals: { sessions: number; clicks: number; rage: number; dead: number; avgActiveMs: number; avgScrollPct: number };
  scroll: [number, number][];
  clicks: ClickPoint[];
  elements: { selector: string; text: string | null; tag: string | null; count: number; rage: number; dead: number }[];
}

const formatCompact = (n: number) => compact.format(Math.round(n));
const formatPct = (n: number) => `${Math.round(n)}%`;
const formatSecs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${Math.round(n)}s`);

export default function HeatmapViewer() {
  const q = useSearchParams();
  const [sites, setSites] = useState<SiteOption[] | null>(null);
  const [site, setSite] = useState(q.get('site') ?? '');
  const [path, setPath] = useState(q.get('path') ?? '');
  const [device, setDevice] = useState(q.get('device') ?? '');
  const [range, setRange] = useState(q.get('range') ?? '30d');
  const [mode, setMode] = useState<HeatMode>((q.get('mode') as HeatMode) ?? 'clicks');
  const [link, setLink] = useState(q.get('link') ?? '');
  const [platform, setPlatform] = useState(q.get('platform') ?? '');
  const [data, setData] = useState<HeatmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    fetch('/api/sites', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => {
        setSites(b.sites);
        setSite((s) => s || b.sites[0]?.key || '');
      })
      .catch(() => setSites([]));
  }, []);

  const load = useCallback(async () => {
    if (!site) return;
    const qs = new URLSearchParams({ site, range });
    if (path) qs.set('path', path);
    if (device) qs.set('device', device);
    if (link) qs.set('link', link);
    if (platform) qs.set('platform', platform);
    const res = await fetch(`/api/heatmap?${qs}`, { cache: 'no-store' }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok || !body) {
      setError(body?.error ?? 'Could not load the heatmap');
      return;
    }
    setError(null);
    setData(body);
  }, [site, path, device, range, link, platform]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const live = useLive(() => {
    load();
    setPulse((p) => p + 1);
  });

  // Shareable URL without navigation.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (site) qs.set('site', site);
    if (path) qs.set('path', path);
    if (device) qs.set('device', device);
    if (range !== '30d') qs.set('range', range);
    if (mode !== 'clicks') qs.set('mode', mode);
    if (link) qs.set('link', link);
    if (platform) qs.set('platform', platform);
    const next = `/heatmaps${qs.toString() ? `?${qs}` : ''}`;
    if (next !== `${location.pathname}${location.search}`) history.replaceState(null, '', next);
  }, [site, path, device, range, mode, link, platform]);

  const snapshotUrl = useMemo(() => {
    if (!data?.snapshot) return null;
    const qs = new URLSearchParams({ site: data.site.key, path: data.path, device: data.device, v: data.snapshot.updatedAt });
    return `/api/heatmap/snapshot?${qs}`;
  }, [data]);

  if (sites && sites.length === 0) {
    return (
      <div className="card mx-auto grid max-w-lg place-items-center gap-3 px-6 py-14 text-center">
        <Flame className="float size-9 text-muted" />
        <p className="text-lg font-semibold">Heatmaps for your own website</p>
        <p className="text-sm text-muted">
          Add a site and paste one script tag into it. Clicks, scrolling and frustration show up here — linked to the short link each
          visitor used.
        </p>
        <Link href="/sites" className="btn-primary mt-2">
          Add your first site
        </Link>
      </div>
    );
  }

  const fallbackW = data?.device === 'Mobile' ? 390 : data?.device === 'Tablet' ? 820 : 1280;
  const pageW = data?.snapshot?.width ?? fallbackW;
  const pageH =
    data?.snapshot?.height ??
    Math.max(1200, ...(data?.scroll.map(([, h]) => h) ?? []), ...(data?.clicks.map((c) => c.y + 200) ?? []));
  const deviceCount = new Map(data?.devices.map((d) => [d.device, d.sessions]));
  const totals = data?.totals;
  const maxEl = data?.elements[0]?.count ?? 1;

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
      <div className="space-y-5">
        {/* Row 1: what page */}
        <div className="flex flex-wrap items-center gap-2">
          <PillSelect
            label="Site"
            icon={<Globe className="size-4" />}
            value={site}
            onChange={(v) => {
              setSite(v);
              setPath('');
              setDevice('');
              setLink('');
              setPlatform('');
            }}
            options={(sites ?? []).map((s) => ({ value: s.key, label: s.name }))}
            className="max-w-[220px]"
          />
          <PillSelect
            label="Page"
            icon={<FileText className="size-4" />}
            value={data?.path ?? path}
            onChange={(v) => {
              setPath(v);
              setDevice('');
            }}
            options={(data?.pages.length ? data.pages : [{ path: data?.path ?? '/', sessions: 0 }]).map((p) => ({
              value: p.path,
              label: `${p.path} · ${p.sessions}`,
            }))}
            className="max-w-[280px] font-mono"
          />
          <div className="segmented">
            {DEVICES.map((d) => (
              <button
                key={d}
                type="button"
                data-active={(data?.device ?? device) === d}
                className="segmented-item"
                onClick={() => setDevice(d)}
              >
                {d} <span className="tabular ml-1 text-muted">{deviceCount.get(d) ?? 0}</span>
              </button>
            ))}
          </div>
          <Segmented value={range} onChange={setRange} options={RANGES} />
          <div className="ml-auto">
            <LiveBadge status={live} pulse={pulse} />
          </div>
        </div>

        {/* Row 2: how to look at it */}
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={mode} onChange={(v) => setMode(v as HeatMode)} options={MODES} />
          <PillSelect
            label="Short link"
            icon={<Link2 className="size-4" />}
            value={link}
            onChange={setLink}
            options={[{ value: '', label: 'All visitors' }, ...(data?.links ?? []).map((l) => ({ value: l.shortId, label: `/${l.shortId} · ${l.sessions}` }))]}
          />
          <PillSelect
            label="Opened from"
            icon={<Share2 className="size-4" />}
            value={platform}
            onChange={setPlatform}
            options={[{ value: '', label: 'Any channel' }, ...(data?.platforms ?? []).map((p) => ({ value: p.platform, label: `${p.platform} · ${p.sessions}` }))]}
          />
        </div>

        {error && <p className="text-sm text-critical">{error}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Page views" value={<CountUp value={totals?.sessions ?? 0} format={formatCompact} />} />
          <Tile label="Clicks" value={<CountUp value={totals?.clicks ?? 0} format={formatCompact} />} />
          <Tile label="Avg. scroll depth" value={<CountUp value={totals?.avgScrollPct ?? 0} format={formatPct} />} />
          <Tile label="Avg. active time" value={<CountUp value={(totals?.avgActiveMs ?? 0) / 1000} format={formatSecs} />} />
          <Tile label="Rage clicks" value={<CountUp value={totals?.rage ?? 0} format={formatCompact} />} status={totals?.rage ? 'critical' : undefined} />
          <Tile label="Dead clicks" value={<CountUp value={totals?.dead ?? 0} format={formatCompact} />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="card min-w-0 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="truncate text-sm font-semibold">
                {data ? (
                  <>
                    {data.site.domain}
                    <span className="font-mono text-muted">{data.path}</span>
                  </>
                ) : (
                  'Loading…'
                )}
              </h2>
              <Legend mode={mode} />
            </div>
            {data && data.totals.sessions === 0 ? (
              <div className="grid h-80 place-items-center rounded-2xl bg-surface-2 text-center text-sm text-muted">
                <div>
                  <p className="font-medium text-ink">No visits match these filters yet</p>
                  <p>Try a wider date range, another device, or clear the link/channel filter.</p>
                </div>
              </div>
            ) : data ? (
              <HeatmapStage
                key={`${data.site.key}|${data.path}|${data.device}`}
                snapshotUrl={snapshotUrl}
                pageWidth={pageW}
                pageHeight={pageH}
                clicks={data.clicks}
                scroll={data.scroll}
                mode={mode}
                highlight={highlight}
              />
            ) : (
              <div className="shimmer h-[520px] rounded-2xl" />
            )}
          </section>

          <section className="card h-fit p-4">
            <h2 className="mb-1 px-1 text-sm font-semibold">Most-clicked elements</h2>
            <p className="mb-3 px-1 text-xs text-muted">Hover to find it on the page</p>
            {!data?.elements.length && <p className="px-1 py-6 text-center text-sm text-muted">No clicks yet</p>}
            <ol className="space-y-1">
              {data?.elements.map((e, i) => (
                <li
                  key={e.selector}
                  onMouseEnter={() => setHighlight(e.selector)}
                  onMouseLeave={() => setHighlight(null)}
                  onFocus={() => setHighlight(e.selector)}
                  onBlur={() => setHighlight(null)}
                  tabIndex={0}
                  className="cursor-default rounded-2xl px-2.5 py-2 transition-colors hover:bg-surface-2 focus:bg-surface-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="tabular w-4 shrink-0 text-xs text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium" title={e.text ?? e.selector}>
                      {e.text ?? `<${e.tag ?? 'element'}>`}
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-2">
                      {e.count} · {pct(e.count, data.totals.clicks)}
                    </span>
                  </div>
                  <div className="ml-6 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${(e.count / maxEl) * 100}%`, background: heatColor(0.75) }} />
                  </div>
                  {(e.rage > 0 || e.dead > 0) && (
                    <p className="ml-6 mt-1 text-[11px] text-muted">
                      {e.rage > 0 && <span className="text-critical">{e.rage} rage</span>}
                      {e.rage > 0 && e.dead > 0 && ' · '}
                      {e.dead > 0 && <span>{e.dead} dead</span>}
                    </p>
                  )}
                  <p className="ml-6 mt-0.5 truncate font-mono text-[10px] text-muted" title={e.selector}>
                    {e.selector}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}

function Tile({ label, value, status }: { label: string; value: React.ReactNode; status?: 'critical' }) {
  return (
    <div className="card fade-up p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${status === 'critical' ? 'text-critical' : ''}`}>{value}</div>
    </div>
  );
}

function Legend({ mode }: { mode: HeatMode }) {
  if (mode === 'clicks') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-muted">
        Fewer
        {[0.05, 0.25, 0.45, 0.65, 0.85, 1].map((t) => (
          <span key={t} className="h-2.5 w-4 rounded-sm" style={{ background: heatColor(t) }} />
        ))}
        More clicks
      </span>
    );
  }
  if (mode === 'scroll') {
    return <span className="text-[11px] text-muted">Darker = fewer visitors scrolled that far</span>;
  }
  return (
    <span className="flex items-center gap-3 text-[11px] text-muted">
      <span className="flex items-center gap-1">
        <span className="grid size-3.5 place-items-center rounded-full bg-[#d03b3b] text-[9px] font-bold text-white">!</span> Rage click
      </span>
      <span className="flex items-center gap-1">
        <span className="grid size-3.5 place-items-center rounded-full bg-[#52514e] text-[9px] font-bold text-white">×</span> Dead click
      </span>
    </span>
  );
}
