/**
 * Rem Companion — MV3 background service worker.
 *
 * Responsibilities in this foundation build:
 *  1. Install declarativeNetRequest (DNR) rules that make YouTube requests look
 *     like they originate from https://www.youtube.com and that expose CORS
 *     headers on YouTube/Google Video responses.
 *  2. Answer the page <-> extension bridge (relayed by content.js):
 *       - ping       -> manifest/version information
 *       - authState  -> cookie presence only (no signing yet)
 *       - ytFetch    -> credentialed fetch against YouTube/Google Video hosts
 *     Other contract messages are reserved and currently return `unsupported`.
 *
 * The worker never proxies audio bytes. It only performs small JSON/HTTP
 * metadata requests and lets the browser stream media directly from Google.
 *
 * This file is intentionally plain JavaScript with no build step so the
 * extension can be loaded unpacked in Chrome, Edge and (temporary) Firefox.
 */

const api = globalThis.browser ?? globalThis.chrome;

const BRIDGE_CONTRACT_VERSION = 1;
const BRIDGE_CHANNEL = 'rem-bridge';
const FETCH_TIMEOUT_MS = 20_000;

/** Dynamic rule ids owned by this extension. Keep stable across updates. */
const RULE_IDS = {
  innertubeWww: 7101,
  innertubeMusic: 7102,
  corsResponse: 7103,
  googlevideoHeaders: 7104,
  visionosNoOrigin: 7105,
};

/**
 * Hosts that the background worker is allowed to fetch.
 * `requestDomains` also matches every subdomain.
 */
const FETCH_DOMAINS = [
  'youtube.com',
  'youtubei.googleapis.com',
  'googlevideo.com',
  'googleusercontent.com',
];

/**
 * Hosts that DNR may rewrite. This is deliberately narrower than
 * FETCH_DOMAINS: we only need to touch InnerTube and media hosts.
 */
const REWRITE_DOMAINS = ['youtube.com', 'youtubei.googleapis.com', 'googlevideo.com'];

/**
 * Pages whose requests may be rewritten. Scoping by initiator keeps YouTube's
 * own tabs (and every other site) untouched.
 */
const SITE_INITIATORS = ['rem-mocha.vercel.app', 'localhost', '127.0.0.1'];

/**
 * Headers that a browser fetch is not allowed to set (or that would leak
 * privileged state). Extensions cannot override these from JavaScript; DNR
 * handles Origin/Referer at the network layer instead.
 */
const FORBIDDEN_REQUEST_HEADERS = new Set([
  'host',
  'cookie',
  'cookie2',
  'origin',
  'referer',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'via',
]);

/**
 * DNR rules.
 *
 * InnerTube answers CORS preflights with 400, so the page sends "simple"
 * text/plain requests; these rules supply the headers YouTube expects and
 * expose the response to the page.
 *
 * Rule 1/2: Origin, Referer and X-Origin on InnerTube calls, as the YouTube
 * web clients send them. Scoped to /youtubei/ on purpose: www.youtube.com's
 * BotGuard endpoint (/api/jnn) refuses a rewritten Origin.
 *
 * Rule 3: permissive CORS response headers on YouTube/Google Video hosts.
 * `Expose-Headers` is required for range/Content-Length handling.
 *
 * Rule 4: googlevideo as the YouTube origin. Rule 5 overrides it for direct
 * VISIONOS URLs, which are refused (403 mid-track) when they carry a web
 * Origin — those are fetched with no Origin/Referer at all.
 */
const DNR_RULES = [
  {
    id: RULE_IDS.innertubeWww,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: 'https://www.youtube.com' },
        { header: 'Referer', operation: 'set', value: 'https://www.youtube.com/' },
        { header: 'X-Origin', operation: 'set', value: 'https://www.youtube.com' },
      ],
    },
    condition: {
      urlFilter: '||www.youtube.com/youtubei/',
      initiatorDomains: SITE_INITIATORS,
      resourceTypes: ['xmlhttprequest'],
    },
  },
  {
    id: RULE_IDS.innertubeMusic,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: 'https://music.youtube.com' },
        { header: 'Referer', operation: 'set', value: 'https://music.youtube.com/' },
        { header: 'X-Origin', operation: 'set', value: 'https://music.youtube.com' },
      ],
    },
    condition: {
      urlFilter: '||music.youtube.com/youtubei/',
      initiatorDomains: SITE_INITIATORS,
      resourceTypes: ['xmlhttprequest'],
    },
  },
  {
    id: RULE_IDS.corsResponse,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' },
        { header: 'Access-Control-Expose-Headers', operation: 'set', value: '*' },
        { header: 'Access-Control-Allow-Headers', operation: 'set', value: '*' },
        { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, HEAD, POST, OPTIONS' },
      ],
    },
    condition: {
      requestDomains: [...REWRITE_DOMAINS, 'googleusercontent.com'],
      initiatorDomains: SITE_INITIATORS,
      resourceTypes: ['xmlhttprequest', 'media', 'other'],
    },
  },
  {
    id: RULE_IDS.googlevideoHeaders,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: 'https://www.youtube.com' },
        { header: 'Referer', operation: 'set', value: 'https://www.youtube.com/' },
      ],
    },
    condition: {
      urlFilter: '||googlevideo.com/',
      initiatorDomains: SITE_INITIATORS,
      resourceTypes: ['xmlhttprequest', 'media'],
    },
  },
  {
    id: RULE_IDS.visionosNoOrigin,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'remove' },
        { header: 'Referer', operation: 'remove' },
      ],
    },
    condition: {
      urlFilter: '||googlevideo.com/*c=VISIONOS',
      initiatorDomains: SITE_INITIATORS,
      resourceTypes: ['xmlhttprequest', 'media'],
    },
  },
];

// ─── Small helpers ───────────────────────────────────────────

function success(data) {
  return { ok: true, data };
}

/**
 * @param {string} code
 * @param {string} message
 * @param {string} [details]
 */
function failure(code, message, details) {
  /** @type {{ code: string, message: string, details?: string }} */
  const error = { code, message };
  if (details) error.details = details;
  return { ok: false, error };
}

function manifestVersion() {
  try {
    return api.runtime.getManifest().version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function extensionId() {
  try {
    return api.runtime.id || undefined;
  } catch {
    return undefined;
  }
}

function pingPayload() {
  return {
    version: manifestVersion(),
    bridgeVersion: BRIDGE_CONTRACT_VERSION,
    // Implemented today.
    capabilities: ['ping', 'authState', 'ytFetch'],
    // Reserved by the shared contract; they return `unsupported` for now.
    reserved: ['addonFetch', 'lyricsFetch', 'spotify', 'discord'],
    extensionId: extensionId(),
  };
}

function isAllowedHost(hostname, domains) {
  if (typeof hostname !== 'string') return false;
  const host = hostname.toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Validate a URL and return a URL object when the host is allow-listed.
 * Only HTTPS is accepted: Google media URLs are HTTPS and this prevents the
 * bridge from being used to probe local/network services.
 */
function validateAllowedUrl(raw, domains) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8192) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!isAllowedHost(url.hostname, domains)) return null;
  return url;
}

function sanitizeHeaders(input) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (!input || typeof input !== 'object') return headers;
  for (const [key, value] of Object.entries(input)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    if (!key || key.length > 256 || value.length > 8192) continue;
    if (FORBIDDEN_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

/**
 * Call a callback-or-promise based extension API in a cross-browser way.
 * Chrome MV3 supports callbacks; Firefox's `browser.*` namespace prefers
 * promises. This helper accepts either and resolves exactly once.
 */
function callApi(fn, ...args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };

    try {
      const maybePromise = fn(...args, (value) => {
        const lastError = api.runtime && api.runtime.lastError;
        if (lastError) finish(undefined, new Error(lastError.message));
        else finish(value);
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(
          (value) => finish(value),
          (error) => finish(undefined, error)
        );
      }
    } catch (error) {
      finish(undefined, error);
    }
  });
}

// ─── DNR installation ────────────────────────────────────────

async function syncRules() {
  if (!api.declarativeNetRequest || !api.declarativeNetRequest.updateDynamicRules) {
    console.warn('[Rem Companion] declarativeNetRequest is unavailable in this browser.');
    return;
  }

  try {
    await api.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: Object.values(RULE_IDS),
      addRules: DNR_RULES,
    });
  } catch (error) {
    // A single rejected header makes the whole update fail. Log loudly so a
    // future browser change is diagnosable from the service-worker console.
    console.error('[Rem Companion] Could not install DNR rules.', error);
  }
}

if (api.runtime.onInstalled) {
  api.runtime.onInstalled.addListener(() => {
    void syncRules();
  });
}

if (api.runtime.onStartup) {
  api.runtime.onStartup.addListener(() => {
    void syncRules();
  });
}

// Dynamic rules persist, but re-run on worker start so updates and Firefox
// event-page restarts always converge on the current rule set.
void syncRules();

// ─── Bridge request handling ─────────────────────────────────

async function getAuthState() {
  if (!api.cookies || !api.cookies.getAll) {
    return {
      signedIn: false,
      hasCookies: false,
      cookieNames: [],
      sapisidHashSupported: false,
      note: 'The cookies API is unavailable in this browser.',
    };
  }

  try {
    const cookies = await callApi(api.cookies.getAll.bind(api.cookies), { domain: '.youtube.com' });
    const names = new Set((Array.isArray(cookies) ? cookies : []).map((cookie) => cookie.name));
    const signedIn = names.has('SAPISID') || names.has('__Secure-3PAPISID') || names.has('SID');
    return {
      signedIn,
      hasCookies: names.size > 0,
      cookieNames: [...names].sort(),
      // Cookie reading exists; SAPISIDHASH signing and InnerTube auth are WS7.
      sapisidHashSupported: false,
      note: signedIn
        ? 'YouTube cookies are present. Signed-in InnerTube calls are not implemented yet.'
        : 'No YouTube session cookies found. Sign in to YouTube in this browser first.',
    };
  } catch (error) {
    return {
      signedIn: false,
      hasCookies: false,
      cookieNames: [],
      sapisidHashSupported: false,
      note: error instanceof Error ? error.message : 'Could not read YouTube cookies.',
    };
  }
}

async function handleYtFetch(payload) {
  const url = validateAllowedUrl(payload && payload.url, FETCH_DOMAINS);
  if (!url) {
    return failure(
      'invalid-host',
      'Only HTTPS YouTube, YouTubei and Google Video hosts are permitted.',
      'The extension refuses arbitrary URLs so a compromised page cannot use it as a proxy.'
    );
  }

  const method = String((payload && payload.method) || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'HEAD') {
    return failure('invalid-request', `Unsupported HTTP method: ${method}`);
  }

  const headers = sanitizeHeaders(payload && payload.headers);
  /** @type {RequestInit} */
  const init = {
    method,
    headers,
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
  };

  if (method === 'POST' && typeof payload.body === 'string') {
    init.body = payload.body;
    const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
    if (!hasContentType) headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  init.signal = controller.signal;

  try {
    const response = await fetch(url.href, init);

    // Refuse to hand back content from a redirect that escaped the allow-list.
    const finalUrl = validateAllowedUrl(response.url || url.href, FETCH_DOMAINS);
    if (!finalUrl) {
      return failure('invalid-host', 'The request redirected outside the permitted YouTube hosts.');
    }

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const text = await response.text();
    return success({
      status: response.status,
      ok: response.ok,
      url: response.url || url.href,
      redirected: response.redirected,
      headers: responseHeaders,
      text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    return failure('network', controller.signal.aborted ? 'The YouTube request timed out.' : message);
  } finally {
    clearTimeout(timer);
  }
}

async function handleMessage(message) {
  switch (message.type) {
    case 'ping':
      return success(pingPayload());
    case 'authState':
      return success(await getAuthState());
    case 'ytFetch':
      return handleYtFetch(message.payload || {});
    case 'addonFetch':
    case 'lyricsFetch':
    case 'spotify':
    case 'discord':
      return failure(
        'unsupported',
        `The "${message.type}" bridge message is reserved for a later workstream.`
      );
    default:
      return failure('unsupported', `Unknown bridge message: ${String(message.type)}`);
  }
}

if (api.runtime.onMessage) {
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.channel !== BRIDGE_CHANNEL || typeof message.type !== 'string') {
      return false;
    }

    handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.error('[Rem Companion] Bridge handler failed.', error);
        sendResponse(failure('internal', 'The extension background worker failed to handle the request.'));
      });

    // Keep the message channel open for the async response.
    return true;
  });
}
