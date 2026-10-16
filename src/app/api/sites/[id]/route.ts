import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(_request: Request, ctx: RouteContext<'/api/sites/[id]'>) {
  const { id } = await ctx.params;
  const { count } = await prisma.site.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
