import { connection, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  ALIAS_PATTERN,
  RESERVED_SLUGS,
  defaultTitle,
  generateSlug,
  normalizeDestination,
} from '@/lib/links';

const SPARK_DAYS = 14;
const DAY = 86_400_000;

export async function GET() {
  await connection();

  const since = new Date(Date.now() - SPARK_DAYS * DAY);
  const [links, totals, qrTotals, recent] = await Promise.all([
    prisma.link.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.visit.groupBy({ by: ['linkId'], where: { isBot: false }, _count: true }),
    prisma.visit.groupBy({
      by: ['linkId'],
      where: { isBot: false, source: 'qr' },
      _count: true,
    }),
    prisma.visit.findMany({
      where: { isBot: false, createdAt: { gte: since } },
      select: { linkId: true, createdAt: true },
    }),
  ]);

  const totalBy = new Map(totals.map((t) => [t.linkId, t._count]));
  const qrBy = new Map(qrTotals.map((t) => [t.linkId, t._count]));

  // Daily click counts for the last 14 days, oldest first, for the row sparklines.
  const startOfWindow = Date.now() - SPARK_DAYS * DAY;
  const sparkBy = new Map<string, number[]>();
  for (const v of recent) {
    const idx = Math.min(
      SPARK_DAYS - 1,
      Math.floor((v.createdAt.getTime() - startOfWindow) / DAY),
    );
    const arr = sparkBy.get(v.linkId) ?? new Array(SPARK_DAYS).fill(0);
    arr[idx] += 1;
    sparkBy.set(v.linkId, arr);
  }

  return NextResponse.json({
    links: links.map((l) => ({
      ...l,
      clicks: totalBy.get(l.id) ?? 0,
      qrScans: qrBy.get(l.id) ?? 0,
      spark: sparkBy.get(l.id) ?? new Array(SPARK_DAYS).fill(0),
    })),
  });
}

export async function POST(request: Request) {
  let body: { url?: unknown; alias?: unknown; title?: unknown; forwardUtm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const destination = typeof body.url === 'string' ? normalizeDestination(body.url) : null;
  if (!destination) {
    return NextResponse.json(
      { error: 'Enter a valid http(s) address, like example.com/page' },
      { status: 400 },
    );
  }

  // Don't let people shorten links back into this app — it creates redirect loops.
  const ownHost = new URL(request.url).host;
  if (new URL(destination).host === ownHost) {
    return NextResponse.json({ error: 'That URL already points at this shortener' }, { status: 400 });
  }

  const alias = typeof body.alias === 'string' ? body.alias.trim() : '';
  const forwardUtm = typeof body.forwardUtm === 'boolean' ? body.forwardUtm : true;
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : defaultTitle(destination);

  if (alias) {
    if (!ALIAS_PATTERN.test(alias)) {
      return NextResponse.json(
        { error: 'Alias must be 3–40 characters: letters, numbers, - or _' },
        { status: 400 },
      );
    }
    if (RESERVED_SLUGS.has(alias.toLowerCase())) {
      return NextResponse.json({ error: `"${alias}" is reserved` }, { status: 400 });
    }
    try {
      const link = await prisma.link.create({
        data: { shortId: alias, originalUrl: destination, title, isCustom: true, forwardUtm },
      });
      return NextResponse.json({ link }, { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: `"${alias}" is already taken` }, { status: 409 });
      }
      throw error;
    }
  }

  // Random slug: rely on the unique constraint rather than check-then-insert, which races.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const link = await prisma.link.create({
        data: { shortId: generateSlug(attempt < 3 ? 7 : 9), originalUrl: destination, title, forwardUtm },
      });
      return NextResponse.json({ link }, { status: 201 });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return NextResponse.json({ error: 'Could not allocate a short link, try again' }, { status: 500 });
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}
