'use client';

import Link from 'next/link';
import { Check, Flame, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StatsLink } from '@/lib/types';
import Switch from './Switch';

interface SiteRow {
  key: string;
  domain: string;
  lastSeenAt: string | null;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Bridges a short link to on-page heatmaps: if the destination is a tracked
 * site, jump straight to its heatmap filtered to this link's visitors.
 */
export default function HeatmapPanel({ link }: { link: StatsLink }) {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [forward, setForward] = useState(link.forwardUtm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/sites', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => setSites(b.sites))
      .catch(() => setSites([]));
  }, []);

  async function toggle(next: boolean) {
    setForward(next);
    setSaving(true);
    const res = await fetch(`/api/links/${encodeURIComponent(link.shortId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ forwardUtm: next }),
    }).catch(() => null);
    if (!res?.ok) setForward(!next);
    setSaving(false);
  }

  const host = hostOf(link.originalUrl);
  const site = sites?.find((s) => host === s.domain || host.endsWith(`.${s.domain}`));
  let path = '/';
  try {
    const p = new URL(link.originalUrl).pathname;
    path = p.length > 1 ? p.replace(/\/+$/, '') : '/';
  } catch {}

  return (
    <section className="card fade-up p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
            <Flame className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">What visitors do on {host || 'the page'}</h2>
            {!sites ? (
              <p className="text-xs text-muted">Checking…</p>
            ) : site ? (
              <p className="text-xs text-muted">
                {site.lastSeenAt ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="size-3 text-good" strokeWidth={3} /> Tracking is installed — heatmaps are filtered to this link&apos;s visitors.
                  </span>
                ) : (
                  'Site added, waiting for the snippet to report its first visit.'
                )}
              </p>
            ) : (
              <p className="text-xs text-muted">Add {host} as a site to see click heatmaps, scroll depth and rage clicks for this link.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2" title="Adds utm_source / utm_medium / utm_campaign on redirect">
            <Switch checked={forward} onChange={toggle} label="Add UTM tags on redirect" disabled={saving} />
            UTM tags
          </label>
          {site ? (
            <Link href={`/heatmaps?site=${site.key}&path=${encodeURIComponent(path)}&link=${link.shortId}`} className="btn-primary">
              <Flame className="size-4" /> Open heatmap
            </Link>
          ) : (
            sites && (
              <Link href={`/sites?domain=${encodeURIComponent(host)}`} className="btn-secondary">
                <Plus className="size-4" /> Track this site
              </Link>
            )
          )}
        </div>
      </div>
    </section>
  );
}
