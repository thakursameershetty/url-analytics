/**
 * Works out *where* a short link was opened from — WhatsApp, Instagram, Gmail…
 *
 * Signals, strongest first:
 *  1. An explicit channel tag on the short link (`?via=whatsapp`, or `utm_source`).
 *  2. The QR code marker (`?src=qr`).
 *  3. In-app browser fingerprints in the User-Agent (Instagram, Facebook, LinkedIn…),
 *     which survive even when the app strips the Referer header.
 *  4. The Referer host, mapped to a friendly platform name.
 * Pure functions, so stats can also classify older visits that predate this column.
 */

// Channel tags offered in the Share menu; also accepted as free-form ?via= values.
export const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'x', label: 'X (Twitter)' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
  { id: 'youtube', label: 'YouTube' },
] as const;

const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.id, c.label]));

// In-app browsers announce themselves in the User-Agent.
const UA_SIGNATURES: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Snapchat/i, 'Snapchat'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/Pinterest/i, 'Pinterest'],
  [/MicroMessenger/i, 'WeChat'],
  [/\bLine\//i, 'LINE'],
  [/KAKAOTALK/i, 'KakaoTalk'],
  [/Telegram/i, 'Telegram'],
  [/WhatsApp/i, 'WhatsApp'],
  [/Twitter|TwitterAndroid/i, 'X (Twitter)'],
  [/Discord/i, 'Discord'],
  [/Slack/i, 'Slack'],
  [/\bGSA\//i, 'Google app'],
];

// Referer host (or android-app:// package) → platform.
const REFERER_RULES: [RegExp, string][] = [
  [/^(com\.whatsapp(\.w4b)?|web\.whatsapp\.com|wa\.me)$/, 'WhatsApp'],
  [/^(org\.telegram\.messenger|web\.telegram\.org|t\.me)$/, 'Telegram'],
  [/(^|\.)instagram\.com$|^com\.instagram\.android$/, 'Instagram'],
  [/(^|\.)(facebook\.com|fb\.com|messenger\.com)$|^com\.facebook\./, 'Facebook'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$|^com\.linkedin\.android$/, 'LinkedIn'],
  [/^(t\.co|(.+\.)?twitter\.com|(.+\.)?x\.com)$|^com\.twitter\.android$/, 'X (Twitter)'],
  [/(^|\.)(youtube\.com|youtu\.be)$|^com\.google\.android\.youtube$/, 'YouTube'],
  [/^(mail\.google\.com|com\.google\.android\.gm)$/, 'Gmail'],
  [/(^|\.)(outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com)$|^com\.microsoft\.office\.outlook$/, 'Outlook'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)(slack\.com|slack-redir\.net)$|^com\.Slack$/, 'Slack'],
  [/(^|\.)discord(app)?\.com$/, 'Discord'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'Pinterest'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/^news\.ycombinator\.com$/, 'Hacker News'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)medium\.com$/, 'Medium'],
  [/^(www\.)?google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, 'Google Search'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
];

export const DIRECT = 'Direct / unknown';

export function platformFromReferer(referer: string | null | undefined): string | null {
  if (!referer || referer === 'Direct') return null;
  const host = referer.toLowerCase();
  for (const [re, name] of REFERER_RULES) if (re.test(host)) return name;
  return referer;
}

export function normalizeVia(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  if (!v) return null;
  if (CHANNEL_LABEL[v]) return CHANNEL_LABEL[v];
  if (v === 'twitter') return CHANNEL_LABEL.x;
  if (v === 'mail' || v === 'newsletter') return CHANNEL_LABEL.email;
  // Free-form tags ("poster", "event-flyer") are kept, title-cased.
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function detectPlatform(input: {
  via?: string | null;
  source?: string | null;
  userAgent?: string | null;
  referer?: string | null;
}): string {
  const tagged = normalizeVia(input.via);
  if (tagged) return tagged;
  if (input.source === 'qr') return 'QR code';
  const ua = input.userAgent ?? '';
  for (const [re, name] of UA_SIGNATURES) if (re.test(ua)) return name;
  return platformFromReferer(input.referer) ?? DIRECT;
}
