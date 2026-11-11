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

export interface LyricWord {
  time: number;
  duration: number;
  text: string;
}

export interface LyricLine {
  time: number;
  duration: number;
  text: string;
  words?: LyricWord[];
}

export interface LyricsResult {
  provider: string;
  synced: boolean;
  lines: LyricLine[];
  plain?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused';
