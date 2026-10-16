import { connection, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/** Used by Railway's health check: the app is up and the database answers. */
export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'database unavailable' }, { status: 503 });
  }
}
