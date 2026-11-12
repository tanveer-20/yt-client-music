import { getApiBase } from '@/config';
import type { Track } from '@/types';

// ─── Types ───────────────────────────────────────────────────

export interface SpotifyStatus {
  connected: boolean;
  anonymous: boolean;
  tokenExpiresAt: number | null;
}

export interface SpotifyTrack {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  isrc?: string;
  thumbnail?: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  artwork?: string;
  tracks: SpotifyTrack[];
}

export interface SpotifyImportMatch {
  source: SpotifyTrack;
  matched: Track | null;
}

export interface SpotifyImportResult {
  playlist: {
    id: string;
    name: string;
    artwork?: string;
    trackCount: number;
  };
  matches: SpotifyImportMatch[];
  matchRate: number;
  matchedCount: number;
  totalCount: number;
  cached?: boolean;
}

export interface DiscordActivity {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  startedAt?: number;
  paused?: boolean;
}

export interface DiscordStatus {
  connected: boolean;
  connecting: boolean;
  username: string | null;
  userId: string | null;
  applicationId: string | null;
  activity: DiscordActivity | null;
  error: string | null;
  since: number | null;
  reconnectAttempt: number;
}

export interface ImportSpotifyInput {
  playlistUrl?: string;
  playlistId?: string;
  limit?: number;
}

// ─── Request plumbing ────────────────────────────────────────

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutMessage?: string;
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 15_000);

  const signal = options.signal
    ? anySignal([options.signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      method: options.method ?? 'GET',
      signal,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? ((await res.json().catch(() => null)) as unknown)
      : null;

    if (!res.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error || '')
          : '';
      throw new Error(message || `Request failed (${res.status})`);
    }

    if (payload === null) {
      throw new Error('The Rem server did not return JSON. Is it running?');
    }

    return payload as T;
  } catch (error) {
    if (timedOut) {
      throw new Error(options.timeoutMessage || 'The Rem server took too long to respond.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the Rem server. Is it running?');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

// ─── Spotify ─────────────────────────────────────────────────

export function getSpotifyStatus(signal?: AbortSignal): Promise<SpotifyStatus> {
  return request<SpotifyStatus>('/spotify/status', { signal });
}

export function connectSpotify(spDc: string): Promise<SpotifyStatus> {
  return request<SpotifyStatus>('/spotify/session', {
    method: 'POST',
    body: { spDc },
    timeoutMs: 30_000,
    timeoutMessage: 'Spotify took too long to mint a token. Try again.',
  });
}

export function disconnectSpotify(): Promise<SpotifyStatus> {
  return request<SpotifyStatus>('/spotify/session', { method: 'DELETE' });
}

export function getSpotifyPlaylist(id: string): Promise<SpotifyPlaylist> {
  return request<SpotifyPlaylist>(`/spotify/playlist/${encodeURIComponent(id)}`, {
    timeoutMs: 60_000,
  });
}

export function importSpotifyPlaylist(input: ImportSpotifyInput): Promise<SpotifyImportResult> {
  return request<SpotifyImportResult>('/spotify/import', {
    method: 'POST',
    body: input,
    timeoutMs: 240_000,
    timeoutMessage:
      'The import is still running. Large playlists can take several minutes; try a lower limit.',
  });
}

// ─── Discord ─────────────────────────────────────────────────

export function getDiscordStatus(signal?: AbortSignal): Promise<DiscordStatus> {
  return request<DiscordStatus>('/discord/status', { signal, timeoutMs: 8_000 });
}

export function connectDiscord(input: {
  token: string;
  clientId?: string;
}): Promise<DiscordStatus> {
  return request<DiscordStatus>('/discord/connect', {
    method: 'POST',
    body: input,
    timeoutMs: 30_000,
    timeoutMessage: 'Discord did not finish connecting in time.',
  });
}

export function setDiscordActivity(activity: DiscordActivity): Promise<DiscordStatus> {
  return request<DiscordStatus>('/discord/activity', {
    method: 'POST',
    body: activity,
  });
}

export function disconnectDiscord(): Promise<DiscordStatus> {
  return request<DiscordStatus>('/discord/disconnect', { method: 'POST' });
}
