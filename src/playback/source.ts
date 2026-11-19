/**
 * Playback source selection: browser-direct when the companion extension is
 * present, otherwise the Rem proxy.
 *
 * Browser-direct resolution happens in the page, from the user's own IP, so
 * googlevideo accepts the URL and the Render server never has to touch
 * playback. Resolved URLs are cached until shortly before they expire.
 */

import type { Track } from '@/types';
import { streamUrl } from '@/config';
import { isExtensionAvailable } from '@/bridge';
import { resolveDirectStream } from './youtube/resolver';

interface CachedStream {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CachedStream>();
const pending = new Map<string, Promise<CachedStream>>();

let directAvailable: boolean | null = null;
let probe: Promise<boolean> | null = null;

/** True once the extension probe has confirmed browser-direct playback. */
export function directPlaybackAvailable(): boolean {
  return directAvailable === true;
}

/**
 * Probe the companion extension once. Safe to call often: the bridge caches
 * its own ping, and this module caches the result.
 */
export function probeDirectPlayback(force = false): Promise<boolean> {
  if (!force && directAvailable !== null) return Promise.resolve(directAvailable);
  if (probe) return probe;

  probe = isExtensionAvailable(force)
    .then((available) => {
      directAvailable = available;
      return available;
    })
    .catch(() => {
      directAvailable = false;
      return false;
    })
    .finally(() => {
      probe = null;
    });

  return probe;
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

/** Start resolving ahead of time (next track, crossfade window). */
export function prefetchDirectUrl(videoId: string): void {
  if (!directPlaybackAvailable() || cachedDirectUrl(videoId)) return;
  void directStream(videoId).catch(() => {
    /* best-effort: playback falls back when the track actually loads */
  });
}

async function directStream(videoId: string): Promise<CachedStream> {
  const hit = cache.get(videoId);
  if (hit && Date.now() < hit.expiresAt) return hit;

  const existing = pending.get(videoId);
  if (existing) return existing;

  const request = resolveDirectStream(videoId)
    .then((stream) => {
      const entry: CachedStream = { url: stream.url, expiresAt: stream.expiresAt };
      cache.set(videoId, entry);
      return entry;
    })
    .finally(() => {
      pending.delete(videoId);
    });

  pending.set(videoId, request);
  return request;
}

/**
 * The URL the audio element should load for [track]: an explicit addon URL,
 * a cached/resolved direct URL, or the proxy as a last resort.
 */
export async function resolvePlaybackUrl(track: Track): Promise<string> {
  if (track.streamUrl) return track.streamUrl;

  if (directAvailable === null) await probeDirectPlayback();

  if (directAvailable) {
    try {
      return (await directStream(track.id)).url;
    } catch (error) {
      console.warn('[playback] Direct resolution failed; falling back to the proxy:', error);
    }
  }

  return streamUrl(track.id);
}
