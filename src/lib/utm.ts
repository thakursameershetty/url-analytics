/**
 * Adds UTM parameters to a destination URL so analytics/heatmap tools on that
 * site (Microsoft Clarity, Google Analytics, PostHog…) know which short link
 * and channel sent the visitor. UTMs already present on the destination win —
 * a link someone tagged by hand is never overwritten.
 */
export function withUtm(
  destination: string,
  utm: { source: string; medium: string; campaign: string },
): string {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }
  const set = (key: string, value: string) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  };
  set('utm_source', utm.source);
  set('utm_medium', utm.medium);
  set('utm_campaign', utm.campaign);
  return url.toString();
}

/** "WhatsApp" → "whatsapp", "X (Twitter)" → "x-twitter", "Direct / unknown" → "direct". */
export function utmSlug(label: string): string {
  if (label.startsWith('Direct')) return 'direct';
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'direct'
  );
}
