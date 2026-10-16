import { connection, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const RANGES: Record<string, number | null> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, all: null };
const MAX_CLICKS = 25_000;

/**
 * GET /api/heatmap?site=<key>&path=/&device=Desktop&range=30d&link=<slug>&platform=WhatsApp
 * Everything the heatmap viewer needs for one page + device, optionally narrowed to
 * visitors who came through a given short link or channel.
 */
export async function GET(request: Request) {
  await connection();
  const q = new URL(request.url).searchParams;
  const site = await prisma.site.findUnique({ where: { key: q.get('site') ?? '' } });
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  const range = q.get('range') && q.get('range')! in RANGES ? q.get('range')! : '30d';
  const days = RANGES[range];
  const since = days == null ? undefined : new Date(Date.now() - days * 86_400_000);
  const base = { siteId: site.id, ...(since ? { startedAt: { gte: since } } : {}) };

  // Narrow to visitors from a short link and/or channel (joined through Visit).
  const link = q.get('link');
  const platform = q.get('platform');
  let visitFilter: { visitId?: { in: string[] }; shortId?: string } = {};
  if (link) visitFilter.shortId = link;
  if (platform) {
    const visits = await prisma.visit.findMany({
      where: { platform, ...(link ? { link: { shortId: link } } : {}) },
      select: { id: true },
    });
    visitFilter = { ...visitFilter, visitId: { in: visits.map((v) => v.id) } };
  }

  const pageRows = await prisma.pageSession.groupBy({
    by: ['path'],
    where: { ...base, ...visitFilter },
    _count: true,
    orderBy: { _count: { path: 'desc' } },
    take: 50,
  });
  const path = q.get('path') ?? pageRows[0]?.path ?? '/';

  const deviceRows = await prisma.pageSession.groupBy({
    by: ['device'],
    where: { ...base, ...visitFilter, path },
    _count: true,
  });
  const device = q.get('device') ?? deviceRows.sort((a, b) => b._count - a._count)[0]?.device ?? 'Desktop';

  const sessions = await prisma.pageSession.findMany({
    where: { ...base, ...visitFilter, path, device },
    select: { id: true, maxScroll: true, docHeight: true, activeMs: true, rageClicks: true, deadClicks: true, clicks: true, shortId: true },
  });
  const ids = sessions.map((s) => s.id);

  const [events, snapshot, linkRows] = await Promise.all([
    ids.length
      ? prisma.pageEvent.findMany({
          where: { sessionId: { in: ids } },
          select: { type: true, x: true, y: true, selector: true, ox: true, oy: true, tag: true, text: true },
          orderBy: { id: 'desc' },
          take: MAX_CLICKS,
        })
      : Promise.resolve([]),
    prisma.pageSnapshot.findUnique({
      where: { siteId_path_device: { siteId: site.id, path, device } },
      select: { width: true, height: true, updatedAt: true },
    }),
    prisma.pageSession.groupBy({ by: ['shortId'], where: { ...base, shortId: { not: null } }, _count: true }),
  ]);

  // Most-clicked elements.
  const bySelector = new Map<string, { selector: string; text: string | null; tag: string | null; count: number; rage: number; dead: number }>();
  for (const e of events) {
    if (!e.selector) continue;
    const row = bySelector.get(e.selector) ?? { selector: e.selector, text: e.text, tag: e.tag, count: 0, rage: 0, dead: 0 };
    row.count += 1;
    if (e.type === 'rage') row.rage += 1;
    if (e.type === 'dead') row.dead += 1;
    if (!row.text && e.text) row.text = e.text;
    bySelector.set(e.selector, row);
  }

  const n = sessions.length || 1;
  const platformRows = await prisma.visit.groupBy({
    by: ['platform'],
    where: { id: { in: (await prisma.pageSession.findMany({ where: { ...base, visitId: { not: null } }, select: { visitId: true } })).map((s) => s.visitId!) } },
    _count: true,
  });

  return NextResponse.json({
    site: { key: site.key, name: site.name, domain: site.domain },
    range,
    path,
    device,
    pages: pageRows.map((p) => ({ path: p.path, sessions: p._count })),
    devices: deviceRows.map((d) => ({ device: d.device, sessions: d._count })),
    links: linkRows.map((l) => ({ shortId: l.shortId!, sessions: l._count })).sort((a, b) => b.sessions - a.sessions),
    platforms: platformRows
      .filter((p) => p.platform)
      .map((p) => ({ platform: p.platform!, sessions: p._count }))
      .sort((a, b) => b.sessions - a.sessions),
    snapshot,
    totals: {
      sessions: sessions.length,
      clicks: events.length,
      rage: events.filter((e) => e.type === 'rage').length,
      dead: events.filter((e) => e.type === 'dead').length,
      avgActiveMs: Math.round(sessions.reduce((s, x) => s + x.activeMs, 0) / n),
      avgScrollPct: Math.round(
        (sessions.reduce((s, x) => s + Math.min(1, x.maxScroll / Math.max(1, x.docHeight)), 0) / n) * 100,
      ),
    },
    // [maxScroll, docHeight] per session, for the scroll-reach map.
    scroll: sessions.map((s) => [s.maxScroll, s.docHeight] as const),
    clicks: events.map((e) => ({ type: e.type, x: e.x, y: e.y, selector: e.selector, ox: e.ox, oy: e.oy })),
    elements: [...bySelector.values()].sort((a, b) => b.count - a.count).slice(0, 12),
  });
}
