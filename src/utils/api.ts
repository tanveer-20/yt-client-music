/**
 * API helper functions for communicating with the backend server.
 */

import type { Track, TrackInfo } from '../types';

const API_BASE = '/api';

/**
 * Search YouTube for tracks.
 */
export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  const params = new URLSearchParams({ q: query, limit: limit.toString() });
  const res = await fetch(`${API_BASE}/search?${params}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(err.error || 'Search failed');
  }

  const data = await res.json();
  return data.results as Track[];
}

/**
 * Get the stream URL for a video. This returns the proxy URL
 * (the server handles fetching from YouTube).
 */
export function getStreamUrl(videoId: string): string {
  return `${API_BASE}/stream/${videoId}`;
}

/**
 * Get detailed info for a track.
 */
export async function getTrackInfo(videoId: string): Promise<TrackInfo> {
  const res = await fetch(`${API_BASE}/info/${videoId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to get info' }));
    throw new Error(err.error || 'Failed to get info');
  }

  return res.json();
}

/**
 * Get suggested/related tracks.
 */
export async function getSuggestions(videoId: string): Promise<Track[]> {
  const res = await fetch(`${API_BASE}/suggestions/${videoId}`);

  if (!res.ok) return [];

  const data = await res.json();
  return data.results as Track[];
}

/**
 * Check server health.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
