import { after, NextResponse, type NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { detectPlatform } from '@/lib/platform';
import { randomUUID } from 'node:crypto';
import { hostMatches } from '@/lib/sites';
import { utmSlug, withUtm } from '@/lib/utm';
import { enrichGeo, readRequestTelemetry } from '@/lib/telemetry';

export async function GET(request: NextRequest, ctx: RouteContext<'/[shortId]'>) {
  const { shortId } = await ctx.params;

  const link = await prisma.link.findUnique({
    where: { shortId },
    select: { id: true, originalUrl: true, forwardUtm: true },
  });

  if (!link) {
    return NextResponse.redirect(
      new URL(`/?missing=${encodeURIComponent(shortId)}`, request.url),
      307,
    );
  }

  // Header parsing is cheap and must happen while the request is still live.
  const telemetry = readRequestTelemetry(request);
  const search = request.nextUrl.searchParams;
  const source = search.get('src') === 'qr' ? 'qr' : 'link';
  const platform = detectPlatform({
    via: search.get('via') ?? search.get('utm_source'),
    source,
    userAgent: telemetry.userAgent,
    referer: telemetry.referer,
  });

  // Known up front so the destination page's analytics can be joined to this click.
  const visitId = randomUUID().replace(/-/g, '');

  // The visitor is redirected immediately; geo lookup and the DB write happen afterwards.
  after(async () => {
    try {
      const t = telemetry.isBot ? telemetry : await enrichGeo(telemetry);
      await prisma.visit.create({ data: { id: visitId, linkId: link.id, source, platform, ...t } });
    } catch (error) {
      console.error('Failed to record visit', error);
    }
  });

  // Tag the destination so heatmap/analytics tools there can segment by link and channel.
  let destination = link.forwardUtm
    ? withUtm(link.originalUrl, {
        source: utmSlug(platform),
        medium: source === 'qr' ? 'qr' : 'shortlink',
        campaign: shortId,
      })
    : link.originalUrl;

  // If the destination runs our /s.js snippet, hand it the visit so heatmaps and
  // sessions can be filtered by link and channel. The snippet removes it from the URL.
  if (!telemetry.isBot) destination = await withVisitRef(destination, shortId, visitId);

  const response = NextResponse.redirect(destination, 302);
  // Browsers must come back through us every time, otherwise repeat clicks go untracked.
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
  return response;
}

async function withVisitRef(destination: string, shortId: string, visitId: string) {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }
  const sites = await prisma.site.findMany({ select: { domain: true } });
  if (!sites.some((s) => hostMatches(url.hostname, s.domain))) return destination;
  url.searchParams.set('snip_v', `${shortId}.${visitId}`);
  return url.toString();
}
