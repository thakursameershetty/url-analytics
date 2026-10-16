import { connection, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateSiteKey, normalizeDomain } from '@/lib/sites';

export async function GET() {
  await connection();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [sites, recent, totals] = await Promise.all([
    prisma.site.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.pageSession.groupBy({ by: ['siteId'], where: { startedAt: { gte: since } }, _count: true }),
    prisma.pageSession.groupBy({ by: ['siteId'], _count: true }),
  ]);
  const recentBy = new Map(recent.map((r) => [r.siteId, r._count]));
  const totalBy = new Map(totals.map((r) => [r.siteId, r._count]));
  return NextResponse.json({
    sites: sites.map((s) => ({
      ...s,
      pageViews7d: recentBy.get(s.id) ?? 0,
      pageViews: totalBy.get(s.id) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown; domain?: unknown } | null;
  const domain = typeof body?.domain === 'string' ? normalizeDomain(body.domain) : null;
  if (!domain) return NextResponse.json({ error: 'Enter a domain like example.com' }, { status: 400 });
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : domain;
  if (await prisma.site.findFirst({ where: { domain } })) {
    return NextResponse.json({ error: `${domain} is already added` }, { status: 409 });
  }
  const site = await prisma.site.create({ data: { key: generateSiteKey(), name, domain } });
  return NextResponse.json({ site }, { status: 201 });
}
