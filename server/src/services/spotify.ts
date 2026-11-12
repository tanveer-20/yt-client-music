/**
 * Spotify integration — token minting and playlist import.
 *
 * The web player cookie (sp_dc) and the minted access token live only in this
 * process. They are never returned to the browser after the initial handshake
 * and are never written to disk or logs.
 */

import { searchTracks, type Track as YouTubeTrack } from './youtube.js';

const TOKEN_URL =
  'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
const API_BASE = 'https://api.spotify.com/v1';

const PLAYLIST_TTL_MS = 10 * 60_000;
const IMPORT_TTL_MS = 30 * 60_000;
const MAX_PLAYLIST_TRACKS = 500;
const DEFAULT_IMPORT_LIMIT = 50;
const MAX_IMPORT_LIMIT = 200;
const MATCH_WINDOW_SECONDS = 10;
const SEARCH_CONCURRENCY = 3;

const PLAYLIST_FIELDS = [
  'id',
  'name',
  'description',
  'owner(display_name,id)',
  'images(url,width,height)',
  'tracks.items(track(id,name,type,is_local,duration_ms,artists(name),album(name,images(url,width,height)),external_ids(isrc)))',
  'tracks.next',
  'tracks.total',
].join(',');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// ─── Public types ────────────────────────────────────────────

export class SpotifyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
  }
}

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

export type MatchedTrack = YouTubeTrack & { album?: string };

export interface SpotifyImportMatch {
  source: SpotifyTrack;
  matched: MatchedTrack | null;
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

// ─── Internal Spotify API shapes ─────────────────────────────

interface SpotifyImage {
  url?: string;
  width?: number;
  height?: number;
}

interface SpotifyApiTrack {
  id?: string | null;
  name?: string;
  type?: string;
  is_local?: boolean;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: { name?: string; images?: SpotifyImage[] };
  external_ids?: { isrc?: string };
}

interface PlaylistItem {
  track?: SpotifyApiTrack | null;
}

interface SpotifyPlaylistResponse {
  id?: string;
  name?: string;
  description?: string | null;
  owner?: { display_name?: string | null; id?: string | null };
  images?: SpotifyImage[];
  tracks?: {
    items?: PlaylistItem[];
    next?: string | null;
    total?: number;
  };
}

interface AccessTokenResponse {
  accessToken?: string;
  accessTokenExpirationTimestampMs?: number;
  isAnonymous?: boolean;
}

interface Session {
  cookie: string;
  accessToken: string;
  expiresAt: number;
  anonymous: boolean;
}

// ─── Session state ───────────────────────────────────────────

let session: Session | null = null;

const playlistCache = new Map<string, { at: number; value: SpotifyPlaylist }>();
const importCache = new Map<string, { at: number; value: SpotifyImportResult }>();

export function getSpotifyStatus(): SpotifyStatus {
  return {
    connected: session !== null,
    anonymous: session?.anonymous ?? false,
    tokenExpiresAt: session?.expiresAt ?? null,
  };
}

/**
 * Validate and store the browser cookie, then mint a web-player access token.
 * Rejects with a readable SpotifyError when the cookie is missing or refused.
 */
export async function connectSpotify(rawCookie: string): Promise<SpotifyStatus> {
  const cookie = sanitizeCookie(rawCookie);
  const next = await mintAccessToken(cookie);

  session = next;
  playlistCache.clear();
  importCache.clear();

  return getSpotifyStatus();
}

export function disconnectSpotify(): SpotifyStatus {
  session = null;
  playlistCache.clear();
  importCache.clear();
  return getSpotifyStatus();
}

// ─── Token handling ──────────────────────────────────────────

function sanitizeCookie(raw: string): string {
  let value = raw.trim();
  if (/^sp_dc=/i.test(value)) value = value.slice('sp_dc='.length);
  value = value.replace(/^["']|["']$/g, '').trim();

  if (!value) {
    throw new SpotifyError(400, 'Paste the sp_dc cookie value from open.spotify.com.');
  }
  if (value.length < 20 || value.length > 4096) {
    throw new SpotifyError(400, 'That does not look like a Spotify sp_dc cookie.');
  }
  if (/[\s;\r\n]/.test(value)) {
    throw new SpotifyError(
      400,
      'The cookie contains spaces or separators. Paste only the sp_dc value.'
    );
  }
  return value;
}

async function mintAccessToken(cookie: string): Promise<Session> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      headers: {
        Accept: 'application/json',
        Cookie: `sp_dc=${cookie}`,
        Referer: 'https://open.spotify.com/',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SpotifyError(
      502,
      'Could not reach Spotify to mint a token. Check the Rem server connection.'
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new SpotifyError(
      401,
      'Spotify rejected this sp_dc cookie. Sign in again and copy a fresh value.'
    );
  }
  if (!res.ok) {
    throw new SpotifyError(502, `Spotify token request failed (${res.status}).`);
  }

  let data: AccessTokenResponse;
  try {
    data = (await res.json()) as AccessTokenResponse;
  } catch {
    throw new SpotifyError(502, 'Spotify returned an unreadable token response.');
  }

  if (!data.accessToken) {
    throw new SpotifyError(502, 'Spotify did not return an access token for this cookie.');
  }

  const expiresAt =
    typeof data.accessTokenExpirationTimestampMs === 'number' &&
    data.accessTokenExpirationTimestampMs > Date.now()
      ? data.accessTokenExpirationTimestampMs
      : Date.now() + 30 * 60_000;

  return {
    cookie,
    accessToken: data.accessToken,
    expiresAt,
    anonymous: data.isAnonymous === true,
  };
}

async function accessToken(forceRefresh = false): Promise<string> {
  if (!session) {
    throw new SpotifyError(401, 'Spotify is not connected. Add your sp_dc cookie first.');
  }
  if (!forceRefresh && session.expiresAt - 60_000 > Date.now()) {
    return session.accessToken;
  }

  const cookie = session.cookie;
  const next = await mintAccessToken(cookie);
  session = next;
  return next.accessToken;
}

async function spotifyGet<T>(pathOrUrl: string, retried = false): Promise<T> {
  const token = await accessToken();
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${API_BASE}${pathOrUrl}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new SpotifyError(502, 'Could not reach the Spotify API from the Rem server.');
  }

  // Web-player tokens can expire early; refresh once and retry.
  if (res.status === 401 && !retried) {
    await accessToken(true);
    return spotifyGet<T>(pathOrUrl, true);
  }
  if (res.status === 404) {
    throw new SpotifyError(404, 'That Spotify playlist could not be found or is private.');
  }
  if (res.status === 403) {
    throw new SpotifyError(403, 'Spotify refused access to this playlist.');
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    throw new SpotifyError(
      429,
      `Spotify is rate limiting requests${retryAfter ? `; try again in ${retryAfter}s` : ''}.`
    );
  }
  if (!res.ok) {
    throw new SpotifyError(502, `Spotify API request failed (${res.status}).`);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new SpotifyError(502, 'Spotify returned an unreadable response.');
  }
}

// ─── Playlist mapping ────────────────────────────────────────

function firstImage(images: SpotifyImage[] | undefined): string | undefined {
  return images?.find((image) => typeof image?.url === 'string' && image.url)?.url;
}

function mapSpotifyTrack(raw: SpotifyApiTrack | null | undefined): SpotifyTrack | null {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  // Podcast episodes cannot be matched against YouTube Music tracks.
  if (raw.type === 'episode') return null;

  const artists = (raw.artists ?? [])
    .map((artist) => (typeof artist?.name === 'string' ? artist.name.trim() : ''))
    .filter(Boolean);

  const duration =
    typeof raw.duration_ms === 'number' && raw.duration_ms > 0
      ? Math.round(raw.duration_ms / 1000)
      : 0;

  return {
    title: raw.name.trim(),
    artist: artists.join(', ') || 'Unknown Artist',
    album:
      typeof raw.album?.name === 'string' && raw.album.name.trim()
        ? raw.album.name.trim()
        : undefined,
    duration,
    isrc:
      typeof raw.external_ids?.isrc === 'string' && raw.external_ids.isrc.trim()
        ? raw.external_ids.isrc.trim()
        : undefined,
    thumbnail: firstImage(raw.album?.images),
  };
}

function mapPlaylist(
  data: SpotifyPlaylistResponse,
  items: PlaylistItem[]
): SpotifyPlaylist {
  const tracks = items
    .map((item) => mapSpotifyTrack(item?.track))
    .filter((track): track is SpotifyTrack => track !== null);

  return {
    id: typeof data.id === 'string' ? data.id : '',
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Spotify playlist',
    description:
      typeof data.description === 'string' && data.description.trim()
        ? data.description.trim()
        : undefined,
    owner:
      (typeof data.owner?.display_name === 'string' && data.owner.display_name.trim()) ||
      (typeof data.owner?.id === 'string' && data.owner.id.trim()) ||
      undefined,
    artwork: firstImage(data.images) || tracks.find((track) => track.thumbnail)?.thumbnail,
    tracks,
  };
}

/** Accept a bare playlist ID, a spotify: URI, or an open.spotify.com link. */
export function extractPlaylistId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (/^[A-Za-z0-9]{10,}$/.test(value)) return value;

  const uri = /^spotify:playlist:([A-Za-z0-9]+)$/i.exec(value);
  if (uri) return uri[1];

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!/(^|\.)spotify\.com$/i.test(url.hostname)) return null;
      const match = /\/playlist\/([A-Za-z0-9]+)/.exec(url.pathname);
      if (match) return match[1];
    } catch {
      return null;
    }
  }

  const inline = /playlist\/([A-Za-z0-9]+)/.exec(value);
  return inline ? inline[1] : null;
}

async function fetchPlaylist(id: string): Promise<SpotifyPlaylist> {
  const data = await spotifyGet<SpotifyPlaylistResponse>(
    `/playlists/${encodeURIComponent(id)}?fields=${encodeURIComponent(PLAYLIST_FIELDS)}`
  );

  const items = [...(data.tracks?.items ?? [])];
  let next = data.tracks?.next ?? null;
  const visited = new Set<string>();

  while (next && items.length < MAX_PLAYLIST_TRACKS && !visited.has(next)) {
    visited.add(next);
    const page = await spotifyGet<{ items?: PlaylistItem[]; next?: string | null }>(next);
    items.push(...(page.items ?? []));
    next = page.next ?? null;
  }

  return mapPlaylist(data, items.slice(0, MAX_PLAYLIST_TRACKS));
}

/**
 * Fetch a playlist (cached for 10 minutes). Accepts an ID or URL.
 */
export async function getSpotifyPlaylist(input: string): Promise<SpotifyPlaylist> {
  if (!session) {
    throw new SpotifyError(401, 'Spotify is not connected. Add your sp_dc cookie first.');
  }

  const id = extractPlaylistId(input);
  if (!id) {
    throw new SpotifyError(400, 'That does not look like a Spotify playlist link or ID.');
  }

  const cached = playlistCache.get(id);
  if (cached && Date.now() - cached.at < PLAYLIST_TTL_MS) {
    return cached.value;
  }

  const value = await fetchPlaylist(id);
  playlistCache.set(id, { at: Date.now(), value });
  return value;
}

// ─── Import / matching ───────────────────────────────────────

function pickBestMatch(
  results: YouTubeTrack[],
  sourceDuration: number
): YouTubeTrack | null {
  if (!results.length) return null;
  if (!sourceDuration || sourceDuration <= 0) return results[0];

  let best: YouTubeTrack | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const result of results) {
    if (!result.duration || result.duration <= 0) continue;
    const delta = Math.abs(result.duration - sourceDuration);
    // Strict < keeps the first result on a tie.
    if (delta <= MATCH_WINDOW_SECONDS && delta < bestDelta) {
      best = result;
      bestDelta = delta;
    }
  }

  return best ?? results[0];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export interface ImportOptions {
  playlistUrl?: string;
  playlistId?: string;
  limit?: number;
}

/**
 * Match a Spotify playlist against YouTube Music. Results are cached for
 * 30 minutes per playlist/limit pair.
 */
export async function importSpotifyPlaylist(
  options: ImportOptions
): Promise<SpotifyImportResult> {
  const raw = options.playlistUrl?.trim() || options.playlistId?.trim() || '';
  const id = extractPlaylistId(raw);
  if (!id) {
    throw new SpotifyError(400, 'Paste a Spotify playlist link or ID to import.');
  }

  const requested =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.floor(options.limit)
      : DEFAULT_IMPORT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_IMPORT_LIMIT, requested));

  const cacheKey = `${id}:${limit}`;
  const cached = importCache.get(cacheKey);
  if (cached && Date.now() - cached.at < IMPORT_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const playlist = await getSpotifyPlaylist(id);
  const sources = playlist.tracks.slice(0, limit);

  const matches = await mapWithConcurrency(
    sources,
    SEARCH_CONCURRENCY,
    async (source): Promise<SpotifyImportMatch> => {
      const query = [source.title, source.artist].filter(Boolean).join(' ');
      let results: YouTubeTrack[] = [];

      try {
        results = await searchTracks(query, 5);
      } catch {
        results = [];
      }

      const best = pickBestMatch(results, source.duration);
      const matched: MatchedTrack | null = best
        ? { ...best, ...(source.album ? { album: source.album } : {}) }
        : null;

      return { source, matched };
    }
  );

  const matchedCount = matches.reduce(
    (count, match) => count + (match.matched ? 1 : 0),
    0
  );

  const value: SpotifyImportResult = {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      artwork: playlist.artwork,
      trackCount: playlist.tracks.length,
    },
    matches,
    matchRate: sources.length ? matchedCount / sources.length : 0,
    matchedCount,
    totalCount: sources.length,
  };

  importCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
