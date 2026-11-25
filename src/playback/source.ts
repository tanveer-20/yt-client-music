/**
 * Playback source selection.
 *
 * Two direct paths are supported:
 *  - `extension`: the companion extension supplies YouTube's Origin/Referer
 *    and the CORS response headers, and YouTube.js resolves in the page from
 *    the listener's own IP. The Capacitor app uses the same in-page resolver
 *    because CapacitorHttp bypasses CORS for it.
 *  - `server`: no extension on the web. A same-origin serverless function
 *    resolves the URL from the cloud; googlevideo re-signs it for the
 *    browser's address (`ipbypass`), so audio still streams from Google.
 *
 * When neither path can mint a URL — YouTube blocks datacenter IPs for most
 * music videos — `resolvePlaybackUrl` throws and the engine falls back to the
 * YouTube IFrame player, which resolves from the listener's own browser.
 */

import { Capacitor } from '@capacitor/core';
import type { Track } from '@/types';
import { directUrl } from '@/config';
import { isExtensionMarked } from '@/bridge';
import { resolveDirectStream } from './youtube/resolver';

export type DirectMode = 'extension' | 'server';

interface CachedStream {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CachedStream>();
const pending = new Map<string, Promise<CachedStream>>();

let mode: DirectMode | null = null;

/** The server resolver is skipped briefly after repeated bot-check failures. */
const SERVER_FAILURE_THRESHOLD = 2;
const SERVER_COOLDOWN_MS = 5 * 60_000;
let serverFailures = 0;
let serverRetryAt = 0;

/** How direct URLs are being resolved, or null before the first probe. */
export function directMode(): DirectMode | null {
  return mode;
}

/**
 * True when the audio element may use CORS mode (Web Audio). Only the web
 * extension supplies the missing googlevideo response headers; native and
 * server playback stay in no-CORS mode.
 */
export function directUsesCors(): boolean {
  return mode === 'extension' && !Capacitor.isNativePlatform();
}

/**
 * Select the direct path. The content script marks the document at
 * document_start, so this is synchronous and cannot race the first tap.
 * Without the marker, the serverless resolver is used.
 */
export function probeDirectPlayback(force = false): Promise<boolean> {
  if (!force && mode !== null) return Promise.resolve(true);
  mode = isExtensionMarked() || Capacitor.isNativePlatform() ? 'extension' : 'server';
  return Promise.resolve(true);
}

/** A still-valid cached URL, or null. */
export function cachedDirectUrl(videoId: string): string | null {
  const hit = cache.get(videoId);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(videoId);
    return null;
  }
  return hit.url;
}

/** Drop a URL that googlevideo refused (expired or bound to another IP). */
export function invalidateDirectUrl(videoId: string): void {
  cache.delete(videoId);
}

function serverCoolingDown(): boolean {
  return Date.now() < serverRetryAt;
}

/** Start resolving ahead of time (next track, crossfade window). */
export function prefetchDirectUrl(videoId: string): void {
  if (mode === null || cachedDirectUrl(videoId)) return;
  if (mode === 'server' && serverCoolingDown()) return;
  void directStream(videoId).catch(() => {
    /* best-effort: playback falls back when the track actually loads */
  });
}

interface ServerStreamResponse {
  url?: string;
  expiresAt?: number;
  error?: string;
  message?: string;
}

async function resolveServerStream(videoId: string): Promise<CachedStream> {
  if (serverCoolingDown()) {
    throw new Error('The server resolver is cooling down after bot-check failures');
  }

  let response: Response;
  try {
    response = await fetch(directUrl(videoId), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7_000),
    });
  } catch (error) {
    serverFailures += 1;
    if (serverFailures >= SERVER_FAILURE_THRESHOLD) serverRetryAt = Date.now() + SERVER_COOLDOWN_MS;
    throw error;
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as ServerStreamResponse;
      detail = body.message || body.error || '';
    } catch {
      /* non-JSON error body */
    }
    serverFailures += 1;
    if (serverFailures >= SERVER_FAILURE_THRESHOLD) serverRetryAt = Date.now() + SERVER_COOLDOWN_MS;
    throw new Error(
      `Direct resolver responded ${response.status}${detail ? `: ${detail}` : ''}`
    );
  }

  const data = (await response.json()) as ServerStreamResponse;
  if (!data.url) throw new Error(data.error || 'Direct resolver returned no URL');

  serverFailures = 0;
  serverRetryAt = 0;
  return {
    url: data.url,
    expiresAt:
      typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 30 * 60_000,
  };
}

function pendingKey(source: DirectMode, videoId: string): string {
  return `${source}:${videoId}`;
}

async function directStream(
  videoId: string,
  source: DirectMode = mode ?? 'server'
): Promise<CachedStream> {
  const hit = cache.get(videoId);
  if (hit && Date.now() < hit.expiresAt) return hit;

  const key = pendingKey(source, videoId);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = (source === 'server'
    ? resolveServerStream(videoId)
    : resolveDirectStream(videoId)
  )
    .then((stream) => {
      const entry: CachedStream = { url: stream.url, expiresAt: stream.expiresAt };
      cache.set(videoId, entry);
      return entry;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

/**
 * A playable URL for [track], or a rejection when neither the extension nor
 * the server can mint one. The engine turns that rejection into the YouTube
 * IFrame player fallback.
 */
export async function resolvePlaybackUrl(track: Track): Promise<string> {
  if (track.streamUrl) return track.streamUrl;

  if (mode === null) await probeDirectPlayback();

  if (mode === 'extension') {
    try {
      return (await directStream(track.id, 'extension')).url;
    } catch (error) {
      console.warn(
        '[playback] In-page resolution failed; trying the server resolver:',
        error
      );
      try {
        return (await directStream(track.id, 'server')).url;
      } catch (serverError) {
        throw new Error(
          `No direct stream available: ${
            serverError instanceof Error ? serverError.message : String(serverError)
          }`
        );
      }
    }
  }

  try {
    return (await directStream(track.id, 'server')).url;
  } catch (error) {
    throw new Error(
      `No direct stream available: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
