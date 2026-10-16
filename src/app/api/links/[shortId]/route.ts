import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/** PATCH { forwardUtm: boolean } — per-link settings. */
export async function PATCH(request: Request, ctx: RouteContext<'/api/links/[shortId]'>) {
  const { shortId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { forwardUtm?: unknown } | null;
  if (typeof body?.forwardUtm !== 'boolean') {
    return NextResponse.json({ error: 'forwardUtm (boolean) is required' }, { status: 400 });
  }
  const { count } = await prisma.link.updateMany({ where: { shortId }, data: { forwardUtm: body.forwardUtm } });
  if (count === 0) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  return NextResponse.json({ ok: true, forwardUtm: body.forwardUtm });
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/links/[shortId]'>) {
  const { shortId } = await ctx.params;
  const { count } = await prisma.link.deleteMany({ where: { shortId } });
  if (count === 0) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
