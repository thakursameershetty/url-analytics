import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { deviceForWidth, hostMatches, pathOf } from '@/lib/sites';
import { corsHeaders, readJson, reportingHost } from './cors';

const SNAPSHOT_MAX_AGE_MS = 24 * 3600_000;
const EVENT_TYPES = new Set(['click', 'rage', 'dead']);
const VISIT_REF = /^([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_-]{8,64})$/;

const int = (v: unknown, min = 0, max = 1_000_000) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;
const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const frac = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Receives batches from /s.js: page-view metadata plus click events. */
export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const body = await readJson(request, 120_000);
  const sessionId = str(body?.s, 64);
  const key = str(body?.k, 64);
  const pageUrl = str(body?.u, 2000);
  if (!body || !sessionId || !key || !pageUrl || !/^[\w-]{8,64}$/.test(sessionId)) {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400, headers });
  }

  const site = await prisma.site.findUnique({ where: { key } });
  if (!site) return NextResponse.json({ error: 'Unknown site' }, { status: 404, headers });
  // Only the site's own pages may report, so a leaked key can't be used to inject data.
  if (!hostMatches(reportingHost(request, pageUrl), site.domain) || !hostMatches(new URL(pageUrl).hostname, site.domain)) {
    return NextResponse.json({ error: 'Origin not allowed for this site' }, { status: 403, headers });
  }

  const viewportW = int(body.w, 1, 10_000);
  const device = deviceForWidth(viewportW);
  const path = pathOf(pageUrl);
  const events = (Array.isArray(body.ev) ? body.ev : [])
    .slice(0, 200)
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && EVENT_TYPES.has(String(e.type)))
    .map((e) => ({
      sessionId,
      type: String(e.type),
      t: int(e.t, 0, 86_400_000),
      x: int(e.x, 0, 100_000),
      y: int(e.y, 0, 1_000_000),
      selector: str(e.sel, 300),
      ox: frac(e.ox),
      oy: frac(e.oy),
      tag: str(e.tag, 20),
      text: str(e.text, 80),
    }));

  const existing = await prisma.pageSession.findUnique({ where: { id: sessionId } });
  if (existing && existing.siteId !== site.id) {
    return NextResponse.json({ error: 'Session belongs to another site' }, { status: 409, headers });
  }

  const counts = {
    clicks: events.length,
    rageClicks: events.filter((e) => e.type === 'rage').length,
    deadClicks: events.filter((e) => e.type === 'dead').length,
  };

  if (!existing) {
    const ref = typeof body.v === 'string' ? VISIT_REF.exec(body.v) : null;
    const url = new URL(pageUrl);
    await prisma.pageSession.create({
      data: {
        id: sessionId,
        siteId: site.id,
        shortId: ref?.[1] ?? null,
        visitId: ref?.[2] ?? null,
        visitorId: str(body.vid, 64) ?? 'anonymous',
        url: `${url.origin}${url.pathname}`,
        path,
        device,
        viewportW,
        viewportH: int(body.h, 1, 10_000),
        docHeight: int(body.dh, 1, 1_000_000),
        maxScroll: int(body.ms, 0, 1_000_000),
        activeMs: int(body.a, 0, 86_400_000),
        referrer: str(body.r, 500),
        utmSource: url.searchParams.get('utm_source')?.slice(0, 60) ?? null,
        utmMedium: url.searchParams.get('utm_medium')?.slice(0, 60) ?? null,
        utmCampaign: url.searchParams.get('utm_campaign')?.slice(0, 60) ?? null,
        ...counts,
      },
    });
  } else {
    await prisma.pageSession.update({
      where: { id: sessionId },
      data: {
        docHeight: Math.max(existing.docHeight, int(body.dh, 1, 1_000_000)),
        maxScroll: Math.max(existing.maxScroll, int(body.ms, 0, 1_000_000)),
        activeMs: Math.max(existing.activeMs, int(body.a, 0, 86_400_000)),
        clicks: { increment: counts.clicks },
        rageClicks: { increment: counts.rageClicks },
        deadClicks: { increment: counts.deadClicks },
      },
    });
  }
  if (events.length) await prisma.pageEvent.createMany({ data: events });

  if (!site.lastSeenAt || Date.now() - site.lastSeenAt.getTime() > 60_000) {
    await prisma.site.update({ where: { id: site.id }, data: { lastSeenAt: new Date() } });
  }

  // On a page view's first report, ask for a fresh snapshot when ours is missing or stale.
  let snapshot = false;
  if (!existing) {
    const snap = await prisma.pageSnapshot.findUnique({
      where: { siteId_path_device: { siteId: site.id, path, device } },
      select: { updatedAt: true, viewportH: true },
    });
    // viewportH 0 = taken by an older snippet that couldn't render full-screen sections correctly.
    snapshot = !snap || snap.viewportH === 0 || Date.now() - snap.updatedAt.getTime() > SNAPSHOT_MAX_AGE_MS;
  }

  return NextResponse.json({ ok: true, snapshot }, { headers });
}
