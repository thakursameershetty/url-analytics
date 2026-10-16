import { randomInt } from 'node:crypto';

// Lookalike characters (0/O, 1/l/I) are left out so slugs survive being read aloud or retyped.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Top-level paths the app itself uses; a link alias must never shadow them.
export const RESERVED_SLUGS = new Set([
  'api',
  'analytics',
  'heatmaps',
  'sites',
  's.js',
  'links',
  'qr',
  'dashboard',
  'settings',
  'login',
  'logout',
  'admin',
  'all',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  '_next',
]);

export const ALIAS_PATTERN = /^[a-zA-Z0-9_-]{3,40}$/;

export function generateSlug(length = 7): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Returns a normalised http(s) URL, or null if the input isn't a usable web address. */
export function normalizeDestination(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Require a real-looking host: "localhost" or something with a dot.
  if (url.hostname !== 'localhost' && !url.hostname.includes('.')) return null;
  return url.toString();
}

export function defaultTitle(url: string): string {
  const u = new URL(url);
  const path = u.pathname === '/' ? '' : u.pathname;
  const title = `${u.hostname.replace(/^www\./, '')}${path}`;
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}
