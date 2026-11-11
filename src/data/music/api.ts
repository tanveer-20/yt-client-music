import { getApiBase } from '@/config';
import type {
  AlbumDetail,
  ArtistDetail,
  HomeFeed,
  PlaylistDetail,
  SearchResults,
  Track,
} from '@/types';

interface LyricsResponse {
  provider: string;
  syncedLyrics?: string;
  plainLyrics?: string;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const combined = signal ? anySignal([signal, controller.signal]) : controller.signal;

  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      signal: combined,
      headers: { Accept: 'application/json' },
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('The Rem server did not return JSON. Is it running?');
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `Request failed (${res.status})`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export function fetchHome(signal?: AbortSignal): Promise<HomeFeed> {
  return request<HomeFeed>('/home', signal);
}

export function searchMusic(query: string, signal?: AbortSignal): Promise<SearchResults> {
  return request<SearchResults>(`/search?q=${encodeURIComponent(query)}`, signal);
}

export function fetchAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetail> {
  return request<AlbumDetail>(`/album/${encodeURIComponent(id)}`, signal);
}

export function fetchArtist(id: string, signal?: AbortSignal): Promise<ArtistDetail> {
  return request<ArtistDetail>(`/artist/${encodeURIComponent(id)}`, signal);
}

export function fetchPlaylist(id: string, signal?: AbortSignal): Promise<PlaylistDetail> {
  return request<PlaylistDetail>(`/playlist/${encodeURIComponent(id)}`, signal);
}

export async function fetchSuggestions(videoId: string): Promise<Track[]> {
  try {
    const data = await request<{ results: Track[] }>(`/suggestions/${encodeURIComponent(videoId)}`);
    return data.results || [];
  } catch {
    return [];
  }
}

export async function fetchLyrics(track: Track): Promise<LyricsResponse | null> {
  const params = new URLSearchParams({
    videoId: track.id,
    title: track.title,
    artist: track.artist,
  });
  if (track.album) params.set('album', track.album);
  if (track.duration) params.set('duration', String(Math.round(track.duration)));

  try {
    return await request<LyricsResponse>(`/lyrics?${params.toString()}`);
  } catch {
    return null;
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok && (res.headers.get('content-type') || '').includes('application/json');
  } catch {
    return false;
  }
}
