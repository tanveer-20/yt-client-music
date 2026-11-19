/**
 * In-page YouTube.js session for browser-direct playback.
 *
 * Playback must be resolved from the user's own IP: googlevideo URLs are
 * bound to the address that asked for them, so a URL minted by the Render
 * server is useless in the browser (and the server's datacenter IP is refused
 * by YouTube's player endpoint anyway).
 *
 * YouTube's InnerTube endpoint answers CORS preflights with 400, so every
 * request is sent as a "simple" request (text/plain body, no custom headers).
 * The companion extension supplies the YouTube Origin/Referer and the CORS
 * response headers at the network layer (extension/background.js).
 */

import type { Innertube, Types } from 'youtubei.js/web';

const YOUTUBE_HOSTS = new Set(['music.youtube.com', 'www.youtube.com', 'youtube.com']);

/** Headers a page may send without triggering a CORS preflight. */
const SAFELISTED = new Set(['accept', 'accept-language', 'content-language']);

let instance: Promise<Innertube> | null = null;

async function simpleRequestFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : input.toString());

  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    return fetch(input, init);
  }

  const method = init?.method ?? request?.method ?? 'GET';
  const source = new Headers(init?.headers ?? request?.headers);
  const headers = new Headers();
  source.forEach((value, key) => {
    if (SAFELISTED.has(key.toLowerCase())) headers.set(key, value);
  });

  let body: BodyInit | null | undefined = init?.body;
  if (body === undefined && request && method !== 'GET' && method !== 'HEAD') {
    body = await request.text();
  }
  if (body != null) headers.set('Content-Type', 'text/plain;charset=UTF-8');

  return fetch(url, {
    method,
    headers,
    body: body ?? null,
    signal: init?.signal ?? request?.signal ?? null,
    // Anonymous: the user's YouTube cookies never ride along on page requests.
    credentials: 'omit',
  });
}

/** The page's YouTube.js instance, created on first use (the bundle is large). */
export function getInnertube(): Promise<Innertube> {
  instance ??= create().catch((error) => {
    instance = null;
    throw error;
  });
  return instance;
}

async function create(): Promise<Innertube> {
  const { Innertube, Platform, UniversalCache } = await import('youtubei.js/web');

  // Runs the player's signature and n-parameter functions, which YouTube.js
  // extracts from YouTube's player script.
  Platform.shim.eval = async (
    data: Types.BuildScriptResult,
    env: Record<string, Types.VMPrimative>
  ) => {
    const properties: string[] = [];
    if (env.n) properties.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
    if (env.sig) properties.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
    return new Function(`${data.output}\nreturn { ${properties.join(', ')} }`)();
  };

  return Innertube.create({
    cache: new UniversalCache(true),
    fetch: simpleRequestFetch,
    retrieve_player: true,
    lang: 'en',
    location: 'US',
  });
}
