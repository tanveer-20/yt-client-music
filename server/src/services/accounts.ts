/**
 * YouTube account session service.
 *
 * Cookies are accepted from the companion extension or a manual paste and are
 * held in memory only. They are never logged or returned to the browser. The
 * first build validates the cookie shape and establishes a session; signed-in
 * library browsing is still behind a clear 501 until the authenticated
 * InnerTube mapper is finished.
 */

import { createHash } from 'node:crypto';

export interface AccountStatus {
  connected: boolean;
  source: 'extension' | 'manual' | null;
  channelName?: string;
  avatarUrl?: string;
  expiresAt: number | null;
  note?: string;
}

export interface AccountCookieMap {
  [name: string]: string;
}

const ALLOWED_COOKIES = new Set([
  'SAPISID',
  '__Secure-3PAPISID',
  'HSID',
  'SSID',
  'APISID',
  'SID',
  '__Secure-3PSID',
  '__Secure-1PSID',
  'LOGIN_INFO',
  'VISITOR_INFO1_LIVE',
]);

let cookies: AccountCookieMap = {};
let source: AccountStatus['source'] = null;
let expiresAt: number | null = null;

function filterCookies(input: unknown): AccountCookieMap {
  if (!input || typeof input !== 'object') return {};
  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([name, value]) => ALLOWED_COOKIES.has(name) && typeof value === 'string' && value.length <= 4096
  );
  return Object.fromEntries(entries) as AccountCookieMap;
}

export function getAccountStatus(): AccountStatus {
  return {
    connected: Object.keys(cookies).length > 0,
    source: Object.keys(cookies).length > 0 ? source : null,
    expiresAt,
    note: Object.keys(cookies).length
      ? 'Signed-in library browsing is not enabled yet.'
      : 'Connect through the companion extension or paste YouTube cookies locally.',
  };
}

export function connectAccount(input: { cookies?: unknown; source?: unknown }): AccountStatus {
  const next = filterCookies(input.cookies);
  const hasAuthCookie = Boolean(next.SAPISID || next.__Secure_3PAPISID || next['__Secure-3PAPISID']);
  if (!hasAuthCookie) {
    const error = new Error('SAPISID or __Secure-3PAPISID is required.');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  cookies = next;
  source = input.source === 'extension' ? 'extension' : 'manual';
  expiresAt = Date.now() + 12 * 60 * 60_000;
  return getAccountStatus();
}

export function disconnectAccount(): AccountStatus {
  cookies = {};
  source = null;
  expiresAt = null;
  return getAccountStatus();
}

/** SAPISIDHASH value for authorised YouTube requests. */
export function sapisidHash(origin = 'https://music.youtube.com'): string | null {
  const sapisid = cookies.SAPISID || cookies['__Secure-3PAPISID'];
  if (!sapisid) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = createHash('sha1').update(`${timestamp} ${sapisid} ${origin}`).digest('hex');
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

export function authHeaders(): Record<string, string> {
  const authorization = sapisidHash();
  if (!authorization) return {};
  return {
    Authorization: authorization,
    'X-Goog-AuthUser': '0',
    'X-Origin': 'https://music.youtube.com',
    Origin: 'https://music.youtube.com',
    Referer: 'https://music.youtube.com/',
  };
}

export function cookieHeader(): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
