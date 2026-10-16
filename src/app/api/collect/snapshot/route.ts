import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { deviceForWidth, hostMatches, pathOf } from '@/lib/sites';
import { corsHeaders, readJson, reportingHost } from '../cors';

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Stores the script-free page HTML that heatmaps are drawn on top of. */
export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const body = await readJson(request, 3_200_000);
  const key = typeof body?.k === 'string' ? body.k : null;
  const pageUrl = typeof body?.u === 'string' ? body.u : null;
  const html = typeof body?.html === 'string' ? body.html : null;
  if (!key || !pageUrl || !html) return NextResponse.json({ error: 'Bad payload' }, { status: 400, headers });

  const site = await prisma.site.findUnique({ where: { key } });
  if (!site) return NextResponse.json({ error: 'Unknown site' }, { status: 404, headers });
  if (!hostMatches(reportingHost(request, pageUrl), site.domain)) {
    return NextResponse.json({ error: 'Origin not allowed for this site' }, { status: 403, headers });
  }

  const width = Math.min(10_000, Math.max(1, Math.round(Number(body?.w) || 1280)));
  const height = Math.min(1_000_000, Math.max(1, Math.round(Number(body?.dh) || 1000)));
  const path = pathOf(pageUrl);
  const device = deviceForWidth(width);

  await prisma.pageSnapshot.upsert({
    where: { siteId_path_device: { siteId: site.id, path, device } },
    create: { siteId: site.id, path, device, html, width, height },
    update: { html, width, height },
  });
  return NextResponse.json({ ok: true }, { headers });
}
