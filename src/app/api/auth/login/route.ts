import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_DAYS, authMode, checkPassword, createSessionToken } from '@/lib/auth';

export async function POST(request: Request) {
  if (authMode() !== 'on') {
    return NextResponse.json({ error: 'Sign-in is not configured (ADMIN_PASSWORD is not set).' }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!(await checkPassword(password))) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
