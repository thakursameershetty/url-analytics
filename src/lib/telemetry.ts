import { userAgent } from 'next/server';

export interface Telemetry {
  ip: string | null;
  isBot: boolean;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  browser: string | null;
  os: string | null;
  device: string;
  deviceVendor: string | null;
  deviceModel: string | null;
  language: string | null;
  referer: string;
  userAgent: string | null;
}

// Link-preview crawlers and other automated fetchers that `userAgent().isBot`
// doesn't always catch. These hit a link when it's pasted into a chat, which
// would otherwise show up as phantom clicks.
const EXTRA_BOT_PATTERN =
  /bot|crawler|spider|preview|slurp|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|skype|vkshare|quora link|pinterest|bitlybot|curl|wget|python-requests|httpclient|go-http-client|headless/i;

export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    null;
  if (!ip) return null;
  // Normalise IPv4-mapped IPv6 addresses ("::ffff:1.2.3.4").
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isPrivateIp(ip: string | null): boolean {
  if (!ip) return true;
  if (ip === '::1' || ip === 'localhost') return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
  );
}

function parseReferer(raw: string | null, ownHost: string): string {
  if (!raw) return 'Direct';
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host === ownHost ? 'Direct' : host;
  } catch {
    return 'Direct';
  }
}

function headerNumber(headers: Headers, name: string): number | null {
  const v = headers.get(name);
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(code: string | null): string | null {
  if (!code || code.length !== 2) return null;
  try {
    return regionNames.of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything we can learn from the request itself — synchronous and cheap, so
 * it can run before the redirect is sent. Geo lookup happens separately.
 */
export function readRequestTelemetry(request: Request): Telemetry {
  const headers = request.headers;
  const ua = userAgent({ headers });
  const rawUA = headers.get('user-agent');
  const isBot = ua.isBot || !rawUA || EXTRA_BOT_PATTERN.test(rawUA);

  let device = 'Desktop';
  switch (ua.device.type) {
    case 'mobile':
      device = 'Mobile';
      break;
    case 'tablet':
      device = 'Tablet';
      break;
    case 'console':
    case 'smarttv':
    case 'wearable':
    case 'embedded':
      device = 'Other';
      break;
  }
  if (isBot) device = 'Bot';

  // Platform-provided geo headers (Vercel, Cloudflare). City is URL-encoded on Vercel.
  const countryCode =
    headers.get('x-vercel-ip-country') || headers.get('cf-ipcountry') || null;
  const cityHeader = headers.get('x-vercel-ip-city') || headers.get('cf-ipcity');
  let city: string | null = null;
  if (cityHeader) {
    try {
      city = decodeURIComponent(cityHeader);
    } catch {
      city = cityHeader;
    }
  }

  const ownHost = new URL(request.url).hostname.replace(/^www\./, '');
  const language = headers.get('accept-language')?.split(',')[0]?.split(';')[0]?.trim() || null;

  return {
    ip: getClientIp(headers),
    isBot,
    country: countryName(countryCode),
    countryCode: countryCode && countryCode !== 'XX' ? countryCode.toUpperCase() : null,
    city,
    region: headers.get('x-vercel-ip-country-region') || headers.get('cf-region') || null,
    latitude: headerNumber(headers, 'x-vercel-ip-latitude') ?? headerNumber(headers, 'cf-iplatitude'),
    longitude: headerNumber(headers, 'x-vercel-ip-longitude') ?? headerNumber(headers, 'cf-iplongitude'),
    browser: ua.browser.name
      ? `${ua.browser.name} ${ua.browser.version?.split('.')[0] ?? ''}`.trim()
      : null,
    os: ua.os.name ? `${ua.os.name} ${ua.os.version ?? ''}`.trim() : null,
    device,
    deviceVendor: ua.device.vendor ?? null,
    // Chrome on Android freezes the model to a placeholder "K" (UA reduction) — not worth showing.
    deviceModel: ua.device.model && ua.device.model !== 'K' ? ua.device.model : null,
    language,
    referer: parseReferer(headers.get('referer'), ownHost),
    userAgent: rawUA?.slice(0, 512) ?? null,
  };
}

/**
 * Fill in location from the IP when the hosting platform didn't supply it.
 * Runs after the redirect has been sent, so a slow lookup never delays visitors.
 */
export async function enrichGeo(t: Telemetry): Promise<Telemetry> {
  if (t.countryCode && t.latitude != null) return t;
  if (isPrivateIp(t.ip)) {
    return { ...t, country: 'Local network', countryCode: 'LAN', city: 'Localhost' };
  }
  try {
    const res = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(t.ip!)}.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return t;
    const g = (await res.json()) as Record<string, string | undefined>;
    const lat = g.latitude ? Number.parseFloat(g.latitude) : NaN;
    const lon = g.longitude ? Number.parseFloat(g.longitude) : NaN;
    return {
      ...t,
      country: t.country ?? g.country ?? null,
      countryCode: t.countryCode ?? g.country_code ?? null,
      city: t.city ?? g.city ?? null,
      region: t.region ?? g.region ?? null,
      latitude: Number.isFinite(lat) ? lat : t.latitude,
      longitude: Number.isFinite(lon) ? lon : t.longitude,
    };
  } catch {
    return t;
  }
}
