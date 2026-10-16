/** The snippet runs on other origins, so the collector answers CORS for any site (no cookies involved). */
export function corsHeaders(request: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': request.headers.get('origin') ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** The page's own host — from the Origin header when present, else from the reported URL. */
export function reportingHost(request: Request, pageUrl: unknown): string | null {
  const origin = request.headers.get('origin');
  try {
    if (origin && origin !== 'null') return new URL(origin).hostname;
    if (typeof pageUrl === 'string') return new URL(pageUrl).hostname;
  } catch {}
  return null;
}

export async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (!text || text.length > maxBytes) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
