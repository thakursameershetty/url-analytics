import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Development-only: seeds fake visits so the dashboard has something to show.
// Disabled in production so nobody can pollute real analytics.

const PLACES = [
  { city: 'Bengaluru', region: 'Karnataka', country: 'India', code: 'IN', lat: 12.97, lon: 77.59, w: 9, lang: 'en-IN' },
  { city: 'Hyderabad', region: 'Telangana', country: 'India', code: 'IN', lat: 17.38, lon: 78.48, w: 7, lang: 'te-IN' },
  { city: 'Mumbai', region: 'Maharashtra', country: 'India', code: 'IN', lat: 19.07, lon: 72.87, w: 5, lang: 'hi-IN' },
  { city: 'San Francisco', region: 'California', country: 'United States', code: 'US', lat: 37.77, lon: -122.42, w: 6, lang: 'en-US' },
  { city: 'New York', region: 'New York', country: 'United States', code: 'US', lat: 40.71, lon: -74.0, w: 6, lang: 'en-US' },
  { city: 'Austin', region: 'Texas', country: 'United States', code: 'US', lat: 30.27, lon: -97.74, w: 3, lang: 'en-US' },
  { city: 'London', region: 'England', country: 'United Kingdom', code: 'GB', lat: 51.51, lon: -0.13, w: 5, lang: 'en-GB' },
  { city: 'Berlin', region: 'Berlin', country: 'Germany', code: 'DE', lat: 52.52, lon: 13.4, w: 3, lang: 'de-DE' },
  { city: 'Paris', region: 'Île-de-France', country: 'France', code: 'FR', lat: 48.86, lon: 2.35, w: 2, lang: 'fr-FR' },
  { city: 'Tokyo', region: 'Tokyo', country: 'Japan', code: 'JP', lat: 35.68, lon: 139.65, w: 3, lang: 'ja-JP' },
  { city: 'Singapore', region: 'Singapore', country: 'Singapore', code: 'SG', lat: 1.35, lon: 103.82, w: 3, lang: 'en-SG' },
  { city: 'Sydney', region: 'New South Wales', country: 'Australia', code: 'AU', lat: -33.87, lon: 151.21, w: 2, lang: 'en-AU' },
  { city: 'Toronto', region: 'Ontario', country: 'Canada', code: 'CA', lat: 43.65, lon: -79.38, w: 2, lang: 'en-CA' },
  { city: 'São Paulo', region: 'São Paulo', country: 'Brazil', code: 'BR', lat: -23.55, lon: -46.63, w: 2, lang: 'pt-BR' },
  { city: 'Dubai', region: 'Dubai', country: 'United Arab Emirates', code: 'AE', lat: 25.2, lon: 55.27, w: 2, lang: 'ar-AE' },
  { city: 'Lagos', region: 'Lagos', country: 'Nigeria', code: 'NG', lat: 6.52, lon: 3.38, w: 1, lang: 'en-NG' },
];

const CLIENTS = [
  { device: 'Mobile', os: 'Android 15', browser: 'Chrome 141', vendor: 'Samsung', model: 'SM-S928B', w: 10 },
  { device: 'Mobile', os: 'iOS 19', browser: 'Mobile Safari 19', vendor: 'Apple', model: 'iPhone', w: 9 },
  { device: 'Desktop', os: 'Windows 11', browser: 'Chrome 141', vendor: null, model: null, w: 8 },
  { device: 'Desktop', os: 'Mac OS 15', browser: 'Safari 19', vendor: null, model: null, w: 4 },
  { device: 'Desktop', os: 'Mac OS 15', browser: 'Chrome 141', vendor: null, model: null, w: 4 },
  { device: 'Desktop', os: 'Windows 11', browser: 'Edge 141', vendor: null, model: null, w: 3 },
  { device: 'Desktop', os: 'Ubuntu 24', browser: 'Firefox 143', vendor: null, model: null, w: 2 },
  { device: 'Tablet', os: 'iPadOS 19', browser: 'Mobile Safari 19', vendor: 'Apple', model: 'iPad', w: 2 },
  { device: 'Mobile', os: 'Android 14', browser: 'Samsung Browser 27', vendor: 'Samsung', model: 'SM-A556E', w: 2 },
];

const REFERRERS = [
  { ref: 'Direct', w: 10 },
  { ref: 'linkedin.com', w: 6 },
  { ref: 't.co', w: 5 },
  { ref: 'google.com', w: 4 },
  { ref: 'instagram.com', w: 3 },
  { ref: 'news.ycombinator.com', w: 2 },
  { ref: 'reddit.com', w: 2 },
];

function pick<T extends { w: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = Math.random() * total;
  for (const i of items) if ((r -= i.w) < 0) return i;
  return items[items.length - 1];
}

// Visits cluster in waking hours and ramp up towards the present.
function randomTimestamp(days: number): Date {
  const age = Math.pow(Math.random(), 1.6) * days;
  const d = new Date(Date.now() - age * 86_400_000);
  if (Math.random() < 0.75) d.setHours(9 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60));
  // Pushing the hour forward can land in the future; shift those back a day.
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  return d;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const { shortIds = [], count = 150 } = (await request.json().catch(() => ({}))) as {
    shortIds?: string[];
    count?: number;
  };
  const n = Math.min(Math.max(Number(count) || 0, 1), 2000);

  const links = await prisma.link.findMany({
    where: shortIds.length ? { shortId: { in: shortIds } } : undefined,
  });
  if (links.length === 0) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const data = Array.from({ length: n }, () => {
    const link = links[Math.floor(Math.random() * links.length)];
    const place = pick(PLACES);
    const client = pick(CLIENTS);
    const isQr = client.device !== 'Desktop' && Math.random() < 0.35;
    const isBot = Math.random() < 0.04;
    return {
      linkId: link.id,
      source: isQr ? 'qr' : 'link',
      isBot,
      ip: `${place.code === 'IN' ? 49 : 80 + Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 254)}`,
      country: place.country,
      countryCode: place.code,
      city: place.city,
      region: place.region,
      latitude: place.lat + (Math.random() - 0.5) * 0.08,
      longitude: place.lon + (Math.random() - 0.5) * 0.08,
      browser: isBot ? null : client.browser,
      os: isBot ? null : client.os,
      device: isBot ? 'Bot' : client.device,
      deviceVendor: client.vendor,
      deviceModel: client.model,
      language: place.lang,
      referer: isQr ? 'Direct' : pick(REFERRERS).ref,
      userAgent: isBot ? 'Slackbot-LinkExpanding 1.0' : `Simulated (${client.os}; ${client.browser})`,
      createdAt: randomTimestamp(45),
    };
  });

  await prisma.visit.createMany({ data });
  return NextResponse.json({ ok: true, created: n });
}
