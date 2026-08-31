// ─── Track ───────────────────────────────────────────────────
export interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // seconds
}

// ─── Playlist ────────────────────────────────────────────────
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

// ─── Player ──────────────────────────────────────────────────
export type RepeatMode = 'off' | 'all' | 'one';
export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// ─── API ─────────────────────────────────────────────────────
export interface SearchResponse {
  results: Track[];
  query: string;
}

export interface StreamInfo {
  url: string;
  format: string;
  quality: string;
  expiresAt?: number;
}

export interface TrackInfo extends Track {
  description?: string;
  viewCount?: number;
  uploadDate?: string;
  channel?: string;
  relatedTracks?: Track[];
}

// ─── Settings ────────────────────────────────────────────────
export type ThemeMode = 'oled' | 'dark' | 'light';
export type AudioQuality = 'high' | 'medium' | 'saver';

// ─── UI ──────────────────────────────────────────────────────
export type View = 'home' | 'search' | 'queue' | 'playlists' | 'playlist-detail' | 'settings';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  duration?: number;
}
