/**
 * API helper functions for communicating with the backend server.
 * Supports dynamic server URLs (for mobile APK & remote servers),
 * defensive response parsing to eliminate "<!doctype" JSON parsing errors,
 * and transparent direct-YouTube fallback.
 */

import type { Track, TrackInfo } from '../types';
import { useSettingsStore } from '../stores/settingsStore';

import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Returns the effective API base URL if a custom server is set.
 */
export function getApiBase(): string {
  const customUrl = useSettingsStore.getState().serverUrl?.trim();
  if (customUrl) {
    const clean = customUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  return '/api';
}

function parseDurationText(text?: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return 0;
}

function extractTrackFromItem(item: any): Track | null {
  const v = item.videoRenderer || item.compactVideoRenderer;
  if (v && v.videoId) {
    const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown';
    const artist =
      v.ownerText?.runs?.[0]?.text ||
      v.longBylineText?.runs?.[0]?.text ||
      v.shortBylineText?.runs?.[0]?.text ||
      'Unknown Artist';

    const thumbs = v.thumbnail?.thumbnails || [];
    const thumbUrl =
      thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
    const durationText = v.lengthText?.simpleText || v.lengthText?.accessibility?.accessibilityData?.label;
    const duration = parseDurationText(durationText);

    return {
      id: v.videoId,
      title,
      artist,
      thumbnail: thumbUrl,
      duration,
    };
  }
  return null;
}

function parseInnerTubeResults(data: any, limit = 40): Track[] {
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ||
    data?.contents?.sectionListRenderer?.contents ||
    [];

  const tracks: Track[] = [];
  const seenIds = new Set<string>();

  for (const s of sections) {
    const items = s.itemSectionRenderer?.contents || [];
    for (const item of items) {
      // 1. Direct video / compact video item
      const track = extractTrackFromItem(item);
      if (track && !seenIds.has(track.id)) {
        seenIds.add(track.id);
        tracks.push(track);
        if (tracks.length >= limit) return tracks;
      }

      // 2. Artist top tracks shelves & playlists
      if (item.shelfRenderer) {
        const shelfItems =
          item.shelfRenderer.content?.verticalListRenderer?.items ||
          item.shelfRenderer.content?.expandedShelfContentsRenderer?.items ||
          [];
        for (const si of shelfItems) {
          const shelfTrack = extractTrackFromItem(si);
          if (shelfTrack && !seenIds.has(shelfTrack.id)) {
            seenIds.add(shelfTrack.id);
            tracks.push(shelfTrack);
            if (tracks.length >= limit) return tracks;
          }
        }
      }
    }
  }
  return tracks;
}

/**
 * Direct YouTube InnerTube search natively via CapacitorHttp (bypasses all CORS on Android)
 * or standard fetch.
 */
async function searchDirectYouTube(query: string, limit = 15, signal?: AbortSignal): Promise<Track[]> {
  const payload = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'en',
        gl: 'US',
      },
    },
    query,
  };

  // Try Native Android CapacitorHttp first (100% bypasses CORS)
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.post({
        url: 'https://www.youtube.com/youtubei/v1/search',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
        data: payload,
      });

      if (res.status === 200 && res.data) {
        const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const tracks = parseInnerTubeResults(parsed, limit);
        if (tracks.length > 0) {
          return tracks;
        }
      }
    } catch (nativeErr) {
      console.warn('Native CapacitorHttp search failed, trying web fetch fallback:', nativeErr);
    }
  }

  // Web fetch fallback
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const tracks = parseInnerTubeResults(data, limit);
      if (tracks.length > 0) return tracks;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
  }

  return [];
}

/**
 * Safe fetch wrapper that verifies JSON content-type before parsing.
 */
async function safeFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    throw new Error(`Cannot connect to server`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server returned non-JSON response`);
  }

  if (!res.ok) {
    throw new Error(`Server error (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export async function searchTracks(query: string, limit = 40, signal?: AbortSignal): Promise<Track[]> {
  const base = getApiBase();

  // 1. Try server search first (works in browser & when connected to local server)
  try {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    const data = await safeFetchJson<{ results: Track[] }>(`${base}/search?${params}`, { signal });
    if (data && Array.isArray(data.results) && data.results.length > 0) {
      return data.results;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
  }

  // 2. Fallback to direct YouTube InnerTube search (CapacitorHttp on mobile or direct fetch)
  try {
    const directResults = await searchDirectYouTube(query, limit, signal);
    if (directResults.length > 0) {
      return directResults;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
  }

  return [];
}

/**
 * Get the stream URL for a video.
 */
export function getStreamUrl(videoId: string): string {
  const base = getApiBase();
  return `${base}/stream/${videoId}`;
}

/**
 * Get detailed info for a track.
 */
export async function getTrackInfo(videoId: string, signal?: AbortSignal): Promise<TrackInfo> {
  const base = getApiBase();
  try {
    return await safeFetchJson<TrackInfo>(`${base}/info/${videoId}`, { signal });
  } catch {
    // Fallback minimal track info
    return {
      id: videoId,
      title: 'YouTube Track',
      artist: 'Unknown Artist',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
    };
  }
}

/**
 * Get suggested/related tracks.
 */
export async function getSuggestions(videoId: string, signal?: AbortSignal): Promise<Track[]> {
  const base = getApiBase();
  try {
    const data = await safeFetchJson<{ results: Track[] }>(`${base}/suggestions/${videoId}`, { signal });
    return data.results || [];
  } catch {
    return [];
  }
}

/**
 * Check server health.
 */
export async function checkHealth(): Promise<boolean> {
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
    const contentType = res.headers.get('content-type') || '';
    return res.ok && contentType.includes('application/json');
  } catch {
    return false;
  }
}
