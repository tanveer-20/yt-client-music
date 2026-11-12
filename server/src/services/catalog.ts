/**
 * Catalog service — YouTube Music metadata via youtubei.js.
 *
 * The client never talks to InnerTube directly. This module owns the
 * WEB_REMIX session, maps the parsed nodes onto Rem's small domain model,
 * and keeps a short-lived cache for every browse surface.
 */

import Innertube from 'youtubei.js';
import { Cache } from '../utils/cache.js';

// ─── Domain types (mirror src/types/index.ts) ───────────────

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail: string;
  duration: number;
  explicit?: boolean;
  year?: string;
  albumId?: string;
  artistId?: string;
}

export type MediaKind = 'album' | 'artist' | 'playlist' | 'track' | 'video';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  subtitle?: string;
  artwork?: string;
  round?: boolean;
  duration?: number;
}

export interface Shelf {
  title: string;
  items: MediaItem[];
}

export interface HomeFeed {
  shelves: Shelf[];
}

export interface AlbumDetail {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  artwork: string;
  year?: string;
  trackCount: number;
  description?: string;
  tracks: Track[];
}

export interface ArtistDetail {
  id: string;
  name: string;
  artwork: string;
  description?: string;
  subscribers?: string;
  topTracks: Track[];
  shelves: Shelf[];
}

export interface PlaylistDetail {
  id: string;
  title: string;
  owner?: string;
  artwork: string;
  description?: string;
  trackCount: number;
  tracks: Track[];
}

export interface SearchResults {
  query: string;
  top?: MediaItem;
  songs: Track[];
  albums: MediaItem[];
  artists: MediaItem[];
  playlists: MediaItem[];
  videos: MediaItem[];
}

export interface LyricsResponse {
  provider: string;
  syncedLyrics?: string;
  plainLyrics?: string;
}

// ─── Client ──────────────────────────────────────────────────

let clientPromise: Promise<Innertube> | null = null;

function getClient(): Promise<Innertube> {
  if (!clientPromise) {
    clientPromise = Innertube.create({
      lang: 'en',
      location: 'US',
      retrieve_player: false,
    }).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

const catalogCache = new Cache<unknown>(10 * 60 * 1000);
const lyricsCache = new Cache<unknown>(30 * 60 * 1000);

// ─── Helpers ─────────────────────────────────────────────────

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  const candidate = value as { toString?: () => string; text?: string };
  if (typeof candidate.text === 'string') return candidate.text;
  if (typeof candidate.toString === 'function') {
    const result = candidate.toString();
    return result === '[object Object]' ? '' : result;
  }
  return '';
}

function bestThumb(thumbs: unknown): string {
  if (!Array.isArray(thumbs) || thumbs.length === 0) return '';
  const usable = thumbs
    .map((thumb) => thumb as { url?: string; width?: number })
    .filter((thumb) => typeof thumb.url === 'string' && thumb.url.length > 0);
  if (!usable.length) return '';
  usable.sort((a, b) => (b.width || 0) - (a.width || 0));
  return usable[0].url || '';
}

function thumbList(node: {
  thumbnails?: unknown;
  /** Raw Innertube shape is `{ contents: [...] }`; parsed MusicTwoRowItem is `Thumbnail[]`. */
  thumbnail?: { contents?: unknown } | unknown[] | null;
  contents?: unknown;
}): string {
  const thumb = node.thumbnail;
  const source = node.thumbnails ?? (Array.isArray(thumb) ? thumb : thumb?.contents) ?? node.contents;
  return bestThumb(source);
}

function cleanArtist(name: string): string {
  return name.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(Official\s+(Music\s+)?Video\)/gi, '')
    .replace(/\s*\[Official\s+(Music\s+)?Video\]/gi, '')
    .replace(/\s*\(Lyric(s)?\s+Video\)/gi, '')
    .replace(/\s*\(Audio\)/gi, '')
    .replace(/\s*\[Audio\]/gi, '')
    .trim();
}

function endpointPayload(node: {
  endpoint?: { payload?: Record<string, unknown> };
}): Record<string, unknown> {
  return node.endpoint?.payload ?? {};
}

function nodeId(node: Record<string, unknown>): string {
  const payload = endpointPayload(node as { endpoint?: { payload?: Record<string, unknown> } });
  const direct =
    node.id ??
    payload.videoId ??
    payload.browseId ??
    payload.playlistId ??
    (node.playlistItemData as { videoId?: string } | undefined)?.videoId;
  return typeof direct === 'string' ? direct : '';
}

function mapTrack(item: Record<string, any>, fallbackArtist = ''): Track | null {
  const id = nodeId(item);
  const title = cleanTitle(
    text(item.title) || text(item.name) || text(item.flex_columns?.[0]?.title)
  );
  if (!id || !title) return null;

  const artists = Array.isArray(item.artists)
    ? item.artists
        .map((artist: { name?: string }) => artist?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && Boolean(name))
    : [];
  const artistNames =
    artists.length > 0
      ? artists.join(', ')
      : text(item.author?.name) || fallbackArtist || 'Unknown Artist';

  return {
    id,
    title,
    artist: cleanArtist(artistNames),
    album: text(item.album?.name) || undefined,
    albumId: typeof item.album?.id === 'string' ? item.album.id : undefined,
    artistId:
      (typeof item.artists?.[0]?.channel_id === 'string' && item.artists[0].channel_id) ||
      (typeof item.author?.channel_id === 'string' && item.author.channel_id) ||
      undefined,
    thumbnail: thumbList(item),
    duration: typeof item.duration?.seconds === 'number' ? item.duration.seconds : 0,
    year: text(item.year) || undefined,
  };
}

function kindFor(item: Record<string, any>, fallback: MediaKind): MediaKind {
  const type = typeof item.item_type === 'string' ? item.item_type : '';
  if (type === 'album') return 'album';
  if (type === 'artist' || type === 'library_artist') return 'artist';
  if (type === 'playlist') return 'playlist';
  if (type === 'video' || type === 'non_music_track') return 'video';
  if (type === 'song') return 'track';
  return fallback;
}

function mapMedia(item: Record<string, any>, fallbackKind: MediaKind = 'album'): MediaItem | null {
  const id = nodeId(item);
  const title = text(item.title) || text(item.name) || text(item.flex_columns?.[0]?.title);
  if (!id || !title) return null;
  const kind = kindFor(item, fallbackKind);

  const artistNames = Array.isArray(item.artists)
    ? item.artists
        .map((artist: { name?: string }) => artist?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && Boolean(name))
        .join(', ')
    : '';

  const subtitle =
    text(item.subtitle) ||
    [artistNames, text(item.year), text(item.song_count)].filter(Boolean).join(' · ') ||
    undefined;

  return {
    id,
    kind,
    title,
    subtitle,
    artwork: thumbList(item),
    round: kind === 'artist',
    duration: typeof item.duration?.seconds === 'number' ? item.duration.seconds : undefined,
  };
}

function mapShelf(shelf: Record<string, any>): Shelf | null {
  const title = text(shelf.header?.title) || text(shelf.title) || 'More to explore';
  const contents: unknown[] = Array.isArray(shelf.contents) ? shelf.contents : [];
  const items = contents
    .map((node) => {
      const item = node as Record<string, any>;
      if (item?.type === 'ContinuationItem') return null;
      return mapMedia(item, item?.item_type === 'song' ? 'track' : 'album');
    })
    .filter((item): item is MediaItem => Boolean(item));

  if (!items.length) return null;
  return { title, items };
}

function trackFromMedia(item: MediaItem): Track {
  return {
    id: item.id,
    title: item.title,
    artist: item.subtitle || 'Unknown Artist',
    thumbnail: item.artwork || '',
    duration: item.duration || 0,
  };
}

// ─── Home ────────────────────────────────────────────────────

async function fallbackHome(): Promise<HomeFeed> {
  const yt = await getClient();
  const [songs, albums, playlists] = await Promise.allSettled([
    yt.music.search('Top songs', { type: 'song' }),
    yt.music.search('New music', { type: 'album' }),
    yt.music.search('Trending music', { type: 'playlist' }),
  ]);

  const shelves: Shelf[] = [];
  if (songs.status === 'fulfilled' && songs.value.songs) {
    const shelf = mapShelf(songs.value.songs as unknown as Record<string, any>);
    if (shelf) shelves.push({ ...shelf, title: 'Top Songs' });
  }
  if (albums.status === 'fulfilled' && albums.value.albums) {
    const shelf = mapShelf(albums.value.albums as unknown as Record<string, any>);
    if (shelf) shelves.push({ ...shelf, title: 'New Albums' });
  }
  if (playlists.status === 'fulfilled' && playlists.value.playlists) {
    const shelf = mapShelf(playlists.value.playlists as unknown as Record<string, any>);
    if (shelf) shelves.push({ ...shelf, title: 'Trending Playlists' });
  }
  return { shelves };
}

export async function getHome(): Promise<HomeFeed> {
  const cached = catalogCache.get('home') as HomeFeed | undefined;
  if (cached) return cached;

  try {
    const yt = await getClient();
    const feed = await yt.music.getHomeFeed();
    const shelves = (feed.sections ?? [])
      .map((section) => mapShelf(section as unknown as Record<string, any>))
      .filter((shelf): shelf is Shelf => Boolean(shelf));

    if (!shelves.length) {
      const fallback = await fallbackHome();
      catalogCache.set('home', fallback, 5 * 60 * 1000);
      return fallback;
    }

    const result = { shelves };
    catalogCache.set('home', result, 10 * 60 * 1000);
    return result;
  } catch (error) {
    console.warn('Home feed failed, using search fallback:', error);
    const fallback = await fallbackHome();
    catalogCache.set('home', fallback, 2 * 60 * 1000);
    return fallback;
  }
}

// ─── Search ──────────────────────────────────────────────────

export async function searchMusic(query: string): Promise<SearchResults> {
  const key = `search:${query.toLowerCase()}`;
  const cached = catalogCache.get(key) as SearchResults | undefined;
  if (cached) return cached;

  const yt = await getClient();
  const [songsResult, albumsResult, artistsResult, playlistsResult, videosResult] =
    await Promise.allSettled([
      yt.music.search(query, { type: 'song' }),
      yt.music.search(query, { type: 'album' }),
      yt.music.search(query, { type: 'artist' }),
      yt.music.search(query, { type: 'playlist' }),
      yt.music.search(query, { type: 'video' }),
    ]);

  const songsShelf = songsResult.status === 'fulfilled' ? songsResult.value.songs : undefined;
  const albumsShelf = albumsResult.status === 'fulfilled' ? albumsResult.value.albums : undefined;
  const artistsShelf = artistsResult.status === 'fulfilled' ? artistsResult.value.artists : undefined;
  const playlistsShelf =
    playlistsResult.status === 'fulfilled' ? playlistsResult.value.playlists : undefined;
  const videosShelf = videosResult.status === 'fulfilled' ? videosResult.value.videos : undefined;

  const songs = (songsShelf?.contents ?? [])
    .map((item) => mapTrack(item as unknown as Record<string, any>))
    .filter((track): track is Track => Boolean(track));

  const albums = (albumsShelf?.contents ?? [])
    .map((item) => mapMedia(item as unknown as Record<string, any>, 'album'))
    .filter((item): item is MediaItem => Boolean(item));

  const artists = (artistsShelf?.contents ?? [])
    .map((item) => mapMedia(item as unknown as Record<string, any>, 'artist'))
    .filter((item): item is MediaItem => Boolean(item));

  const playlists = (playlistsShelf?.contents ?? [])
    .map((item) => mapMedia(item as unknown as Record<string, any>, 'playlist'))
    .filter((item): item is MediaItem => Boolean(item));

  const videos = (videosShelf?.contents ?? [])
    .map((item) => mapMedia(item as unknown as Record<string, any>, 'video'))
    .filter((item): item is MediaItem => Boolean(item));

  const top: MediaItem | undefined =
    artists[0] ??
    albums[0] ??
    playlists[0] ??
    (songs[0]
      ? {
          id: songs[0].id,
          kind: 'track',
          title: songs[0].title,
          subtitle: songs[0].artist,
          artwork: songs[0].thumbnail,
          duration: songs[0].duration,
        }
      : undefined);

  const response: SearchResults = { query, top, songs, albums, artists, playlists, videos };
  if (!songs.length && !albums.length && !artists.length && !playlists.length && !videos.length) {
    throw new Error('No music results');
  }
  catalogCache.set(key, response, 5 * 60 * 1000);
  return response;
}

// ─── Album ───────────────────────────────────────────────────

export async function getAlbum(id: string): Promise<AlbumDetail> {
  const key = `album:${id}`;
  const cached = catalogCache.get(key) as AlbumDetail | undefined;
  if (cached) return cached;

  const yt = await getClient();
  const album = await yt.music.getAlbum(id);
  const header = album.header as Record<string, any> | undefined;

  const subtitle = text(header?.subtitle);
  const subtitleParts = subtitle
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean);
  const strapline = text(header?.strapline_text_one);

  const albumArtist =
    text(header?.author?.name) ||
    (strapline && strapline !== 'N/A' ? strapline : '') ||
    subtitleParts.find((part) => !/^(album|single|ep)$/i.test(part) && !/^\d{4}$/.test(part)) ||
    'Unknown Artist';

  const secondSubtitle = text(header?.second_subtitle);
  const year =
    text(header?.year) || subtitleParts.find((part) => /^\d{4}$/.test(part)) || undefined;

  const tracks: Track[] = (album.contents ?? [])
    .map((item): Track | null => {
      const track = mapTrack(item as unknown as Record<string, any>, albumArtist);
      if (!track) return null;
      return {
        ...track,
        album: track.album || text(header?.title),
        albumId: id,
      };
    })
    .filter((track): track is Track => Boolean(track));

  const artwork =
    bestThumb(header?.thumbnails) || bestThumb(header?.thumbnail?.contents) || thumbList(album.background ?? {});
  const trackCount =
    parseInt(text(header?.song_count), 10) || parseInt(secondSubtitle, 10) || tracks.length;

  const detail: AlbumDetail = {
    id,
    title: text(header?.title) || 'Album',
    artist: cleanArtist(albumArtist),
    artistId:
      typeof header?.author?.channel_id === 'string' ? header.author.channel_id : undefined,
    artwork,
    year,
    trackCount,
    description:
      text(header?.description?.description) || text(header?.description) || undefined,
    tracks,
  };

  catalogCache.set(key, detail, 30 * 60 * 1000);
  return detail;
}

// ─── Artist ──────────────────────────────────────────────────

export async function getArtist(id: string): Promise<ArtistDetail> {
  const key = `artist:${id}`;
  const cached = catalogCache.get(key) as ArtistDetail | undefined;
  if (cached) return cached;

  const yt = await getClient();
  const artist = await yt.music.getArtist(id);
  const header = artist.header as Record<string, any> | undefined;

  const shelves = (artist.sections ?? [])
    .map((section) => mapShelf(section as unknown as Record<string, any>))
    .filter((shelf): shelf is Shelf => Boolean(shelf));

  let topShelf = shelves.find((shelf) => /song|top/i.test(shelf.title));
  if (!topShelf) {
    topShelf = shelves.find((shelf) => shelf.items.some((item) => item.kind === 'track'));
  }

  let topTracks = (topShelf?.items ?? [])
    .filter((item) => item.kind === 'track' || item.kind === 'video')
    .map(trackFromMedia);

  if (!topTracks.length) {
    try {
      const all = await artist.getAllSongs();
      if (all) {
        topTracks = (all.contents ?? [])
          .map((item) => mapTrack(item as unknown as Record<string, any>, text(header?.title)))
          .filter((track): track is Track => Boolean(track))
          .slice(0, 20);
      }
    } catch {
      /* artist may not expose a full songs shelf */
    }
  }

  const detail: ArtistDetail = {
    id,
    name: text(header?.title) || 'Artist',
    artwork:
      bestThumb(header?.thumbnails) ||
      bestThumb(header?.thumbnail?.contents) ||
      bestThumb(header?.foreground_thumbnail),
    description: text(header?.description) || undefined,
    topTracks,
    shelves: shelves.filter((shelf) => shelf !== topShelf),
  };

  catalogCache.set(key, detail, 30 * 60 * 1000);
  return detail;
}

// ─── Playlist ────────────────────────────────────────────────

export async function getPlaylist(id: string): Promise<PlaylistDetail> {
  const key = `playlist:${id}`;
  const cached = catalogCache.get(key) as PlaylistDetail | undefined;
  if (cached) return cached;

  const yt = await getClient();
  let playlist = await yt.music.getPlaylist(id);
  const header = playlist.header as Record<string, any> | undefined;

  const rawItems: Record<string, any>[] = [];
  for (const item of playlist.contents ?? []) {
    if ((item as unknown as { type?: string }).type !== 'ContinuationItem') {
      rawItems.push(item as unknown as Record<string, any>);
    }
  }

  for (let page = 0; page < 3 && playlist.has_continuation; page++) {
    try {
      playlist = await playlist.getContinuation();
      for (const item of playlist.contents ?? []) {
        if ((item as unknown as { type?: string }).type !== 'ContinuationItem') {
          rawItems.push(item as unknown as Record<string, any>);
        }
      }
    } catch {
      break;
    }
  }

  const tracks = rawItems
    .map((item) => mapTrack(item))
    .filter((track): track is Track => Boolean(track));

  const subtitle = text(header?.subtitle);
  const secondSubtitle = text(header?.second_subtitle);
  const strapline = text(header?.strapline_text_one);
  const ownerCandidate =
    text(header?.author?.name) || (strapline && strapline !== 'N/A' ? strapline : '');
  const owner = ownerCandidate.trim() || undefined;
  const countMatch = /(\d[\d,]*)\s+(?:tracks?|songs?)/i.exec(secondSubtitle);
  const trackCount =
    parseInt(text(header?.item_count) || text(header?.song_count), 10) ||
    (countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : 0) ||
    tracks.length;

  const detail: PlaylistDetail = {
    id,
    title: text(header?.title) || 'Playlist',
    owner,
    artwork:
      bestThumb(header?.thumbnails) ||
      bestThumb(header?.thumbnail?.contents) ||
      thumbList(playlist.background ?? {}),
    description:
      text(header?.description?.description) || text(header?.description) || undefined,
    trackCount,
    tracks,
  };

  catalogCache.set(key, detail, 15 * 60 * 1000);
  return detail;
}

// ─── Lyrics ──────────────────────────────────────────────────

interface LyricsRequest {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

async function lrclibExact(request: LyricsRequest): Promise<LyricsResponse | null> {
  const params = new URLSearchParams({
    track_name: request.title,
    artist_name: request.artist,
  });
  if (request.album) params.set('album_name', request.album);
  if (request.duration) params.set('duration', String(Math.round(request.duration)));

  const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
    headers: {
      'User-Agent': 'RemMusic/2.0 (https://github.com/rem-music)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
  };
  if (!data.syncedLyrics && !data.plainLyrics) return null;
  return {
    provider: 'LRCLIB',
    syncedLyrics: data.syncedLyrics || undefined,
    plainLyrics: data.plainLyrics || undefined,
  };
}

async function lrclibSearch(request: LyricsRequest): Promise<LyricsResponse | null> {
  const response = await fetch(
    `https://lrclib.net/api/search?q=${encodeURIComponent(`${request.title} ${request.artist}`)}`,
    {
      headers: {
        'User-Agent': 'RemMusic/2.0 (https://github.com/rem-music)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!response.ok) return null;
  const list = (await response.json()) as Array<{
    trackName?: string;
    artistName?: string;
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
  }>;
  if (!Array.isArray(list) || !list.length) return null;

  const target = request.title.toLowerCase();
  const match =
    list.find((entry) => entry.trackName?.toLowerCase() === target) ??
    list.find((entry) => entry.syncedLyrics) ??
    list[0];

  if (!match.syncedLyrics && !match.plainLyrics) return null;
  return {
    provider: 'LRCLIB',
    syncedLyrics: match.syncedLyrics || undefined,
    plainLyrics: match.plainLyrics || undefined,
  };
}

async function youtubeMusicLyrics(videoId: string): Promise<LyricsResponse | null> {
  try {
    const yt = await getClient();
    const shelf = await yt.music.getLyrics(videoId);
    const plain = text(shelf?.description);
    if (!plain) return null;
    return { provider: 'YouTube Music', plainLyrics: plain };
  } catch {
    return null;
  }
}

export async function getLyrics(request: LyricsRequest): Promise<LyricsResponse | null> {
  const key = `lyrics:${request.videoId}`;
  const cached = lyricsCache.get(key) as LyricsResponse | null | undefined;
  if (cached !== undefined) return cached;

  let result: LyricsResponse | null = null;

  try {
    result = await lrclibExact(request);
  } catch {
    /* try search */
  }

  if (!result) {
    try {
      result = await lrclibSearch(request);
    } catch {
      /* fall through */
    }
  }

  if (!result) {
    result = await youtubeMusicLyrics(request.videoId);
  }

  lyricsCache.set(key, result, 30 * 60 * 1000);
  return result;
}
