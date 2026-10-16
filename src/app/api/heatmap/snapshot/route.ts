import { connection } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Serves a stored page snapshot as HTML for the heatmap <iframe>. The HTML came
 * from another site, so it's locked down: no scripts, no forms, no being framed
 * by anything but this app. The iframe also carries sandbox="allow-same-origin".
 */
export async function GET(request: Request) {
  await connection();
  const q = new URL(request.url).searchParams;
  const site = await prisma.site.findUnique({ where: { key: q.get('site') ?? '' }, select: { id: true } });
  if (!site) return new Response('Not found', { status: 404 });
  const snap = await prisma.pageSnapshot.findUnique({
    where: { siteId_path_device: { siteId: site.id, path: q.get('path') ?? '/', device: q.get('device') ?? 'Desktop' } },
    select: { html: true },
  });
  if (!snap) return new Response('Not found', { status: 404 });
  return new Response(snap.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "script-src 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    },
  });
}
