/**
 * Vercel Serverless Function — Direct stream resolver
 * GET /api/direct?id=<videoId>
 *
 * Resolves a playable googlevideo URL from Vercel's IP and returns it to the
 * browser. No audio bytes pass through this function.
 *
 * googlevideo URLs minted for one address normally reject another, but the
 * VISIONOS client returns URLs that answer a request from a different address
 * with a 302 carrying `ipbypass=yes&mip=<client ip>`; the redirect re-signs
 * the URL for the caller, so the browser can stream directly from Google.
 *
 * The companion extension still resolves in-page when it is installed; this
 * endpoint is the no-extension path. YouTube bot-checks many datacenter IPs
 * ("Sign in to confirm you're not a bot"), so the browser treats a 502 here
 * as a signal to use the IFrame player from the listener's own address.
 */

import Innertube, { Log } from 'youtubei.js';

Log.setLevel(Log.Level.ERROR);

export const config = { maxDuration: 30 };

const CLIENTS = [
  'VISIONOS',
  'IOS',
  'ANDROID_VR',
  'TV_SIMPLY',
  'TV_EMBEDDED',
  'WEB_EMBEDDED',
  'YTMUSIC_ANDROID',
  'ANDROID',
  'MWEB',
  'TV',
];

const EXPIRY_MARGIN_MS = 5 * 60_000;
const FALLBACK_TTL_MS = 30 * 60_000;

/** In-memory cache, per function instance. */
const cache = new Map();

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = Innertube.create({
      lang: 'en',
      location: 'US',
      retrieve_player: true,
    }).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

function expiryOf(url) {
  try {
    const expire = Number(new URL(url).searchParams.get('expire'));
    if (Number.isFinite(expire) && expire > 0) {
      return Math.max(Date.now() + 60_000, expire * 1000 - EXPIRY_MARGIN_MS);
    }
  } catch {
    /* fall through */
  }
  return Date.now() + FALLBACK_TTL_MS;
}

function pickFormat(info) {
  const adaptive = info.streaming_data?.adaptive_formats ?? [];
  const audio = adaptive.filter((format) => format.has_audio && !format.has_video);

  // Prefer Opus 251, then AAC 140, then the next-best audio-only format.
  const chosen =
    [251, 140, 250, 249]
      .map((itag) => audio.find((candidate) => candidate.itag === itag))
      .find(Boolean) || audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  if (chosen) return { format: chosen, kind: 'audio' };

  // Some restricted tracks only expose muxed streams. An <audio> element can
  // play those too, at the cost of downloading the video track as well.
  const muxed = (info.streaming_data?.formats ?? []).filter(
    (format) => format.has_audio && format.has_video
  );
  const fallback =
    muxed.find((candidate) => candidate.itag === 18) ||
    muxed.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))[0];

  return fallback ? { format: fallback, kind: 'muxed' } : null;
}

/** Compact, non-secret summary of a player response for diagnostics. */
function summarize(info) {
  const adaptive = info.streaming_data?.adaptive_formats ?? [];
  const muxed = info.streaming_data?.formats ?? [];
  return {
    playability: info.playability_status?.status,
    reason: info.playability_status?.reason,
    streamingData: Boolean(info.streaming_data),
    audioOnly: adaptive.filter((format) => format.has_audio && !format.has_video).length,
    muxed: muxed.filter((format) => format.has_audio && format.has_video).length,
  };
}

async function resolve(videoId) {
  const hit = cache.get(videoId);
  if (hit && Date.now() < hit.expiresAt) return hit;

  const yt = await getClient();
  const attempts = [];
  let lastError = null;
  // The browser aborts at 7 s and falls back to the IFrame player; stop
  // trying clients shortly before that so the function does not keep running.
  const deadline = Date.now() + 6_500;

  for (const client of CLIENTS) {
    if (Date.now() >= deadline) break;
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const picked = pickFormat(info);
      if (!picked) {
        const error = new Error('no playable format in the player response');
        error.details = summarize(info);
        throw error;
      }

      const { format, kind } = picked;
      const url = await format.decipher(yt.session.player);
      if (!url) throw new Error(`no deciphered URL (itag ${format.itag})`);

      const mime = format.mime_type || 'audio/webm; codecs="opus"';
      const name = mime.includes('mp4') ? 'm4a' : mime.includes('webm') ? 'webm' : 'audio';
      const result = {
        videoId,
        url,
        format: name,
        contentType: mime,
        itag: format.itag,
        kind,
        client,
        expiresAt: expiryOf(url),
      };

      cache.set(videoId, result);
      return result;
    } catch (error) {
      attempts.push({
        client,
        error: error instanceof Error ? error.message : String(error),
        ...(error?.details ? { details: error.details } : {}),
      });
      lastError = error;
    }
  }

  const failure = lastError instanceof Error
    ? lastError
    : new Error('No YouTube client could resolve this track');
  failure.attempts = attempts;
  throw failure;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.query.probe === '1') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, service: 'direct', region: process.env.VERCEL_REGION });
    return;
  }

  const videoId = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^[\w-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'A valid YouTube video id is required.' });
    return;
  }

  try {
    const result = await resolve(videoId);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=300');
    res.status(200).json(result);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    const body = {
      error: 'Could not resolve a direct stream.',
      message: error instanceof Error ? error.message : String(error),
    };
    if (req.query.debug === '1' && error?.attempts) body.attempts = error.attempts;
    res.status(502).json(body);
  }
}
