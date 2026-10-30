import { NextResponse, type NextRequest } from 'next/server';

// WhatsApp template buttons that open a link chosen when sending ("/go/<code>"). Meta fixes the start of a
// button's link, so the WhatsApp Sender app keeps the code → destination table; this domain only passes the
// visitor through, so customers see this address instead of the WhatsApp app's.
const WHATSAPP_APP_URL = (process.env.WHATSAPP_APP_URL || 'https://whatsapp-crm-production-5eb0.up.railway.app').replace(/\/+$/, '');

// Same answer the WhatsApp app gives for an unknown code; its domain check looks for this text.
const MISSING = 'This link has expired or never existed.';

export async function GET(_request: NextRequest, ctx: RouteContext<'/go/[code]'>) {
  const { code } = await ctx.params;
  if (!/^[a-z0-9]{1,32}$/i.test(code)) return missing();

  let upstream: Response;
  try {
    upstream = await fetch(`${WHATSAPP_APP_URL}/go/${encodeURIComponent(code)}`, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('WhatsApp short link lookup failed', error);
    return new NextResponse('This link is unavailable right now. Please try again in a moment.', {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const destination = upstream.headers.get('location');
  if (upstream.status >= 300 && upstream.status < 400 && destination && /^https?:\/\//i.test(destination)) {
    const response = NextResponse.redirect(destination, 302);
    // Every tap goes through the WhatsApp app so it's counted there.
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }
  return missing();
}

function missing() {
  return new NextResponse(MISSING, {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
