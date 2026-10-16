/**
 * Single-admin auth: one password from ADMIN_PASSWORD, and a signed, expiring
 * session cookie. Uses Web Crypto only, so it works in the proxy and in route handlers.
 *
 * - Locally with no ADMIN_PASSWORD set, auth is off (so `npm run dev` just works).
 * - In production with no ADMIN_PASSWORD, the dashboard stays locked (fail closed).
 */

export const SESSION_COOKIE = 'snip_session';
export const SESSION_DAYS = 30;

export type AuthMode = 'on' | 'off' | 'misconfigured';

export function authMode(): AuthMode {
  if (process.env.ADMIN_PASSWORD) return 'on';
  return process.env.NODE_ENV === 'production' ? 'misconfigured' : 'off';
}

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Changing ADMIN_PASSWORD (or AUTH_SECRET) invalidates every existing session.
async function signingKey() {
  const secret = `${process.env.AUTH_SECRET ?? ''}|${process.env.ADMIN_PASSWORD ?? ''}|snip-session-v1`;
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(payload: string) {
  return b64url(await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken() {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  return `${expires}.${await sign(String(expires))}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(sig, await sign(expires));
}

/** Compares HMACs of both values so timing doesn't reveal how much of the password matched. */
export async function checkPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([sign(`pw:${input}`), sign(`pw:${expected}`)]);
  return safeEqual(a, b);
}
