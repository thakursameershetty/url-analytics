import { connection, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { detectPlatform } from '@/lib/platform';

const RANGES: Record<string, number | null> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

type Row = { key: string; count: number };

function tally<T>(items: T[], keyOf: (item: T) => string | null | undefined): Row[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyOf(it) || 'Unknown';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

// "Mobile Safari 18" -> "Mobile Safari", "Mac OS 15.1" -> "Mac OS"
const withoutVersion = (s: string | null) => (s ? s.replace(/\s+[\d.]+$/, '') : null);

/**
 * GET /api/stats?links=a,b&range=30d
 * `links` is a comma-separated list of slugs; omit it for every link.
 */
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const rangeParam = params.get('range') ?? '30d';
  const days = rangeParam in RANGES ? RANGES[rangeParam] : 30;
  const since = days == null ? undefined : new Date(Date.now() - days * 86_400_000);

  const requested = (params.get('links') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const selected = await prisma.link.findMany({
    where: requested.length ? { shortId: { in: requested } } : undefined,
    orderBy: { createdAt: 'asc' },
    select: { id: true, shortId: true, originalUrl: true, title: true, createdAt: true, forwardUtm: true },
  });
  if (requested.length && selected.length === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const linkFilter = requested.length ? { linkId: { in: selected.map((l) => l.id) } } : {};
  const where = { ...linkFilter, ...(since ? { createdAt: { gte: since } } : {}) };
  const [visits, botCount] = await Promise.all([
    prisma.visit.findMany({
      where: { ...where, isBot: false },
      orderBy: { createdAt: 'desc' },
      include: { link: { select: { shortId: true } } },
    }),
    prisma.visit.count({ where: { ...where, isBot: true } }),
  ]);

  // Older visits predate the platform column; classify them from what was stored.
  const platformOf = (v: (typeof visits)[number]) =>
    v.platform ?? detectPlatform({ source: v.source, userAgent: v.userAgent, referer: v.referer });

  const indexOf = new Map(selected.map((l, i) => [l.id, i]));
  const mode = !requested.length ? 'all' : selected.length === 1 ? 'single' : 'multi';

  // Geo bubbles: group by rounded coordinates so a city is one bubble.
  const geo = new Map<
    string,
    { lat: number; lon: number; city: string; country: string; count: number }
  >();
  for (const v of visits) {
    if (v.latitude == null || v.longitude == null) continue;
    const key = `${v.latitude.toFixed(1)},${v.longitude.toFixed(1)}`;
    const g = geo.get(key) ?? {
      lat: v.latitude,
      lon: v.longitude,
      city: v.city ?? 'Unknown',
      country: v.country ?? 'Unknown',
      count: 0,
    };
    g.count += 1;
    geo.set(key, g);
  }

  const countryRows = new Map<string, { key: string; code: string | null; count: number }>();
  for (const v of visits) {
    const key = v.country ?? 'Unknown';
    const r = countryRows.get(key) ?? { key, code: v.countryCode, count: 0 };
    r.count += 1;
    countryRows.set(key, r);
  }

  return NextResponse.json({
    mode,
    links: selected.map((l) => ({
      shortId: l.shortId,
      originalUrl: l.originalUrl,
      title: l.title,
      createdAt: l.createdAt,
      forwardUtm: l.forwardUtm,
    })),
    range: rangeParam in RANGES ? rangeParam : '30d',
    totals: {
      clicks: visits.length,
      uniqueVisitors: new Set(visits.map((v) => v.ip ?? v.userAgent).filter(Boolean)).size,
      qrScans: visits.filter((v) => v.source === 'qr').length,
      botsFiltered: botCount,
    },
    // Raw timestamps so the browser can bucket by its own timezone.
    // [timestamp, isQr, index into `links`] — the index lets the client split series per link.
    events: visits.map((v) => [v.createdAt.getTime(), v.source === 'qr' ? 1 : 0, indexOf.get(v.linkId) ?? 0] as const),
    byLink: tally(visits, (v) => v.link.shortId),
    countries: [...countryRows.values()].sort((a, b) => b.count - a.count),
    cities: tally(visits, (v) => (v.city ? `${v.city}${v.countryCode ? `, ${v.countryCode}` : ''}` : null)),
    devices: tally(visits, (v) => v.device),
    browsers: tally(visits, (v) => withoutVersion(v.browser)),
    os: tally(visits, (v) => withoutVersion(v.os)),
    referrers: tally(visits, (v) => v.referer),
    platforms: tally(visits, platformOf),
    languages: tally(visits, (v) => v.language),
    geo: [...geo.values()],
    recent: visits.slice(0, 100).map((v) => ({
      id: v.id,
      at: v.createdAt,
      ip: v.ip,
      city: v.city,
      region: v.region,
      country: v.country,
      countryCode: v.countryCode,
      device: v.device,
      deviceName: [v.deviceVendor, v.deviceModel].filter(Boolean).join(' ') || null,
      browser: v.browser,
      os: v.os,
      referer: v.referer,
      platform: platformOf(v),
      language: v.language,
      source: v.source,
      shortId: v.link.shortId,
    })),
  });
}
