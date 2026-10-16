import { randomBytes } from 'node:crypto';

export function generateSiteKey() {
  return `site_${randomBytes(9).toString('base64url')}`;
}

/** "https://www.Example.com/about" → "example.com". Returns null if it isn't a usable host. */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  if (host !== 'localhost' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

/** True when `host` is the site's domain or one of its subdomains (www included). */
export function hostMatches(host: string | null | undefined, domain: string) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === domain || h.endsWith(`.${domain}`);
}

/** Heatmaps are split by layout: phones, tablets and desktops lay pages out differently. */
export function deviceForWidth(width: number) {
  return width < 768 ? 'Mobile' : width < 1024 ? 'Tablet' : 'Desktop';
}

/** Pages are grouped by origin path only: query strings and hashes don't change the layout. */
export function pathOf(url: string) {
  try {
    const p = new URL(url).pathname;
    return p.length > 1 ? p.replace(/\/+$/, '') : '/';
  } catch {
    return '/';
  }
}
