import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, authMode, verifySessionToken } from '@/lib/auth';

// Dashboard pages. Every other single-segment path is a short link and stays public.
const DASHBOARD_PAGES = new Set(['/', '/analytics', '/heatmaps', '/sites']);

// Public API: the tracking snippet's collector, sign-in/out and the health check.
const PUBLIC_API = ['/api/collect', '/api/auth/', '/api/health'];

function isPublic(pathname: string) {
  if (pathname === '/login') return true;
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) return true;
  if (pathname.startsWith('/api/')) return false;
  // Static files (s.js, favicon, demo page…). Short-link slugs can't contain dots.
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  // A single path segment that isn't a dashboard page is a short link → redirect stays public.
  if (/^\/[^/]+$/.test(pathname) && !DASHBOARD_PAGES.has(pathname)) return true;
  // Everything else — dashboard pages and any route added later — requires sign-in.
  return false;
}

/** Deny by default: only the explicit public surface skips the login check. */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const mode = authMode();
  if (mode === 'off') return NextResponse.next();

  if (mode === 'misconfigured') {
    const msg = 'Dashboard locked: set the ADMIN_PASSWORD environment variable and redeploy.';
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: msg }, { status: 503 })
      : new NextResponse(msg, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip Next's own assets; everything else goes through the check above.
  matcher: ['/((?!_next/).*)'],
};
