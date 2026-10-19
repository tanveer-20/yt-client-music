/**
 * Vercel Serverless Function — Audio Stream Proxy (background-playback capable)
 *
 * GET  /api/stream?id=<videoId>  → 200/206 audio stream (Range-aware, CORS-enabled)
 * HEAD /api/stream?id=<videoId>  → capability probe used by the web player before
 *                                  switching to the HTML5 <audio> engine (no body)
 *
 * Why this exists:
 * Mobile browsers cannot keep a cross-origin YouTube iframe playing in the background.
 * Background audio requires a top-level HTML5 <audio> element (navigator.mediaSession),
 * which in turn needs a CORS-enabled, Range-capable audio URL. This function resolves
 * an audio-only googlevideo URL via InnerTube server-side and proxies the bytes.
 *
 * YouTube's "confirm you're not a bot" wall rejects bare InnerTube player calls. The
 * resolution flow mirrors a real browser session (and yt-dlp): fetch the watch page
 * first, keep its cookies + VISITOR_DATA, then call /youtubei/v1/player with
 * X-Goog-Visitor-Id. Without it every client returns LOGIN_REQUIRED (verified locally).
 *
 * Each response is capped at CHUNK_BYTES so a single invocation never stays open for
 * the whole track; the media element simply issues the next Range request for the rest.
 */

import { Readable } from 'node:stream';

const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const CHUNK_BYTES = 1024 * 1024; // ~60–130s of audio per invocation
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,15}$/;
const PAGE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

// InnerTube clients — mirrors current yt-dlp configs. VISIONOS and ANDROID_VR
// return plain (non-ciphered) audio URLs when the visitor session is present.
const MUSIC_PLAYER_URL = 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false';
const CLIENTS = [
  {
    name: 'VISIONOS',
    version: '1.02',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    clientNameHeader: '101',
    extraContext: {
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice17,1',
      osName: 'visionOS',
      osVersion: '26.5.23O471',
    },
  },
  {
    name: 'ANDROID_VR',
    version: '1.65.10',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    clientNameHeader: '28',
    extraContext: {
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      androidSdkVersion: 32,
      osName: 'Android',
      osVersion: '12L',
    },
  },
  {
    name: 'IOS',
    version: '21.26.4',
    userAgent:
      'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    clientNameHeader: '5',
    extraContext: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
    },
  },
  {
    name: 'ANDROID_TESTSUITE',
    version: '1.9',
    userAgent: 'Google-Test-Suite',
    clientNameHeader: '162',
    url: PLAYER_URL,
  },
  {
    name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    version: '2.0',
    userAgent: 'Mozilla/5.0 (PlayStation; PlayStation 4/10.01)',
    clientNameHeader: '85',
    url: PLAYER_URL,
    extraContext: {
      thirdParty: {
        embedUrl: 'https://www.youtube.com',
      },
    },
  },
  {
    // music.youtube.com host: api/search.js + api/suggestions.js have proven this
    // host is NOT bot-walled from Vercel's datacenter IPs for months. WEB_REMIX
    // sometimes returns plain URLs for audio itags; if formats come back
    // signatureCipher-ed we record a distinct reason for future escalation.
    // music.youtube.com host: api/search.js + api/suggestions.js have proven this
    // host is NOT bot-walled from Vercel's datacenter IPs for months. WEB_REMIX
    // sometimes returns plain URLs for audio itags; if formats come back
    // signatureCipher-ed we record a distinct reason for future escalation.
    name: 'WEB_REMIX',
    version: '1.20250914.01.00',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    clientNameHeader: '67',
    url: MUSIC_PLAYER_URL,
    origin: 'https://music.youtube.com',
    referer: 'https://music.youtube.com/',
  },
  {
    // googleapis.com host variant for the best mobile client — enforcement can
    // differ between www.youtube.com and the Google API edge domain.
    name: 'ANDROID_VR_GOOGLEAPIS',
    version: '1.65.10',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    clientNameHeader: '28',
    url: 'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false',
    extraContext: {
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      androidSdkVersion: 32,
      osName: 'Android',
      osVersion: '12L',
    },
  },
  {
    name: 'WEB_EMBEDDED_PLAYER',
    version: '1.20250918.02.00',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    clientNameHeader: '56',
    url: PLAYER_URL,
    extraContext: {
      clientScreen: 'EMBED',
      thirdParty: {
        embedUrl: 'https://rem-mocha.vercel.app',
      },
    },
  },
];

// Warm-instance caches. Best effort only — serverless instances recycle.
const streamCache = new Map();
let visitorSession = null; // { cookies, visitorData, expiresAt }
let visitorSessionPromise = null;

function parseExpiry(url) {
  const match = /[?&]expire=(\d+)/.exec(url);
  if (match) return (parseInt(match[1], 10) - 60) * 1000; // 60s safety margin
  return Date.now() + 30 * 60 * 1000;
}

function pruneCache() {
  if (streamCache.size <= 50) return;
  const now = Date.now();
  for (const [key, value] of streamCache) {
    if (value.expiresAt <= now) streamCache.delete(key);
  }
  while (streamCache.size > 50) streamCache.delete(streamCache.keys().next().value);
}

/**
 * Establish a YouTube visitor session: cookies + VISITOR_DATA from the watch page.
 * This is what makes InnerTube accept the player call from a server.
 */
async function getVisitorSession(videoId, { force = false } = {}) {
  if (!force && visitorSession && visitorSession.expiresAt > Date.now()) {
    return visitorSession;
  }
  if (force) {
    // A flagged/stale session poisons every player call that reuses it — drop it
    // so the next attempt re-establishes from a brand-new watch-page fetch.
    visitorSession = null;
    visitorSessionPromise = null;
  }
  if (visitorSessionPromise) return visitorSessionPromise;

  visitorSessionPromise = (async () => {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      {
        headers: {
          'User-Agent': PAGE_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-us,en;q=0.5',
        },
      }
    );
    const html = await response.text();

    const rawCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [];
    const cookies = rawCookies
      .map((cookie) => cookie.split(';')[0])
      .filter(Boolean)
      .join('; ');

    const match =
      /"VISITOR_DATA":"([^"]+)"/.exec(html) ||
      /"visitorData":"([^"]+)"/.exec(html);
    let visitorData = null;
    if (match) {
      try {
        visitorData = JSON.parse(`"${match[1]}"`);
      } catch {
        visitorData = match[1];
      }
    }

    visitorSession = {
      cookies,
      visitorData,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    console.log(
      `[stream] visitor session http=${response.status} cookies=${rawCookies.length} visitorData=${visitorData ? 'yes' : 'no'}`
    );
    return visitorSession;
  })();

  try {
    return await visitorSessionPromise;
  } finally {
    visitorSessionPromise = null;
  }
}

// Prefer itag 140 (AAC/mp4 — plays in every browser), then 251 (Opus/webm),
// then the highest-bitrate audio format available.
function pickAudioFormat(streamingData) {
  if (!streamingData) return null;
  const formats = [
    ...(streamingData.adaptiveFormats || []),
    ...(streamingData.formats || []),
  ].filter(
    (format) =>
      format &&
      format.url &&
      typeof format.mimeType === 'string' &&
      format.mimeType.startsWith('audio/')
  );
  if (formats.length === 0) return null;
  return (
    formats.find((format) => format.itag === 140) ||
    formats.find((format) => format.itag === 251) ||
    formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
  );
}

async function resolveAudio(videoId) {
  const cached = streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return { entry: cached };
  }

  let session;
  try {
    session = await getVisitorSession(videoId);
  } catch (error) {
    console.log(`[stream] ${videoId}: visitor_session_failed (${error.message})`);
    return { entry: null, reason: 'visitor_session_failed' };
  }

  const reasons = [];

  for (let i = 0; i < CLIENTS.length; i++) {
    const client = CLIENTS[i];

    // Rotate the visitor session for every attempt after the first. A session
    // minted alongside a bot-flagged player response stays poisoned for its
    // lifetime, so each new client attempt gets its own fresh watch-page seed.
    if (i > 0) {
      try {
        session = await getVisitorSession(videoId, { force: true });
      } catch {
        // keep the previous session rather than aborting the whole resolve
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const cookie = [session.cookies, 'PREF=hl=en&tz=UTC', 'SOCS=CAI']
        .filter(Boolean)
        .join('; ');
      const response = await fetch(client.url || PLAYER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
          'X-YouTube-Client-Name': client.clientNameHeader,
          'X-YouTube-Client-Version': client.version,
          ...(session.visitorData ? { 'X-Goog-Visitor-Id': session.visitorData } : {}),
          Origin: client.origin || 'https://www.youtube.com',
          ...(client.referer ? { Referer: client.referer } : {}),
          'Accept-Language': 'en-us,en;q=0.5',
          Cookie: cookie,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.name,
              clientVersion: client.version,
              hl: 'en',
              gl: 'US',
              timeZone: 'UTC',
              utcOffsetMinutes: 0,
              ...(session.visitorData
                ? { visitorData: session.visitorData }
                : {}),
              ...(client.extraContext || {}),
            },
          },
          videoId,
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: 'HTML5_PREF_WANTS',
            },
          },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const reason = `${client.name}_http_${response.status}`;
        reasons.push(reason);
        console.log(`[stream] ${videoId}: ${reason}`);
        continue;
      }

      const data = await response.json();
      const format = pickAudioFormat(data && data.streamingData);
      if (!format) {
        const playability = (data && data.playabilityStatus) || {};
        const reason = `${client.name}_${playability.status || 'no_formats'}${
          playability.reason ? `_${playability.reason}` : ''
        }`;
        reasons.push(reason);
        console.log(`[stream] ${videoId}: ${reason}`);
        continue;
      }

      const entry = {
        url: format.url,
        mime: format.mimeType,
        userAgent: client.userAgent,
        expiresAt: parseExpiry(format.url),
      };
      streamCache.set(videoId, entry);
      pruneCache();
      return { entry };
    } catch (error) {
      clearTimeout(timer);
      const reason = `${client.name}_${
        error && error.name === 'AbortError' ? 'timeout' : 'error'
      }`;
      reasons.push(reason);
      console.log(`[stream] ${videoId}: ${reason} (${error && error.message})`);
    }
  }

  // A stale visitor session is the usual reason every client suddenly fails.
  visitorSession = null;
  return { entry: null, reason: reasons[reasons.length - 1] || 'no_clients_responded', reasons };
}

// Cap every proxied response to CHUNK_BYTES. The media element sees the full resource
// length in Content-Range and simply issues the next Range request for the remainder,
// so no single function invocation has to stay open for the whole track.
function clampRange(rangeHeader) {
  if (typeof rangeHeader !== 'string' || !rangeHeader) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return rangeHeader; // suffix/multi-range: pass through untouched
  const start = parseInt(match[1], 10);
  const explicitEnd = match[2] ? parseInt(match[2], 10) : null;
  const maxEnd = start + CHUNK_BYTES - 1;
  const end = explicitEnd === null ? maxEnd : Math.min(explicitEnd, maxEnd);
  return `bytes=${start}-${end}`;
}

function fetchUpstream(entry, range) {
  return fetch(entry.url, {
    headers: {
      'User-Agent': entry.userAgent,
      // Never let the CDN compress audio bytes
      'Accept-Encoding': 'identity',
      ...(range ? { Range: range } : {}),
    },
  });
}

/**
 * `ReadableStream.cancel()` returns a promise even when it fails with
 * "ReadableStream is locked", so a sync try/catch is not enough — an unhandled
 * rejection would take down the function. Always swallow it.
 */
function cancelBody(response) {
  if (!response || !response.body) return;
  try {
    response.body.cancel().catch(() => {});
  } catch {}
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Range, Content-Length, Accept-Ranges'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const videoId = req.query && (req.query.id || req.query.videoId);
  if (!videoId || typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) {
    return sendJson(res, 400, { error: 'Invalid or missing video id' });
  }

  const isHead = req.method === 'HEAD';

  try {
    let resolved = await resolveAudio(videoId);
    if (!resolved.entry) {
      return sendJson(res, 502, {
        error: 'resolution_failed',
        reason: resolved.reason || 'unknown',
        ...(resolved.reasons && resolved.reasons.length > 0
          ? { reasons: resolved.reasons }
          : {}),
      });
    }

    // HEAD validates playability with a minimal 2-byte range so the web player only
    // commits to the HTML5 engine when this track is actually streamable.
    // googlevideo throttles non-ranged downloads to ~32KB/s, so ALWAYS ask for a range —
    // when the client didn't send one, we still fetch (and answer) a chunked partial.
    const clientRange =
      typeof req.headers.range === 'string' && req.headers.range.length > 0
        ? req.headers.range
        : null;
    const range = isHead ? 'bytes=0-1' : clampRange(clientRange || 'bytes=0-');

    let upstream = await fetchUpstream(resolved.entry, range);

    // Expired/stale googlevideo URL → invalidate cache, re-resolve once and retry.
    if (upstream.status === 403 || upstream.status === 410) {
      cancelBody(upstream);
      streamCache.delete(videoId);
      resolved = await resolveAudio(videoId);
      if (!resolved.entry) {
        return sendJson(res, 502, {
          error: 'resolution_failed',
          reason: resolved.reason || 'stale_url',
          ...(resolved.reasons && resolved.reasons.length > 0
            ? { reasons: resolved.reasons }
            : {}),
        });
      }
      upstream = await fetchUpstream(resolved.entry, range);
    }

    if (!upstream.ok && upstream.status !== 206) {
      cancelBody(upstream);
      return sendJson(res, 502, {
        error: 'upstream_error',
        status: upstream.status,
      });
    }

    const contentType =
      upstream.headers.get('content-type') || resolved.entry.mime || 'audio/mpeg';

    if (isHead) {
      cancelBody(upstream);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }

    res.statusCode = upstream.status; // 200 (unexpected upstream) or 206 (partial)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => res.destroy());
    res.on('close', () => {
      cancelBody(upstream);
    });
    body.pipe(res);
  } catch (error) {
    console.error('[stream] handler error:', error);
    if (!res.headersSent) {
      sendJson(res, 502, { error: 'proxy_error' });
    } else {
      res.destroy();
    }
  }
}
