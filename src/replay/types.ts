/** Replay data model — personal listening statistics stored locally. */

export type ReplayRange = 'week' | 'month' | 'year' | 'all';

export type ReplayCounterKind = 'track' | 'artist' | 'album';

/** A single tracked listening session. */
export interface PlayRecord {
  /** Auto-incremented by the `plays` object store. */
  id?: number;
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration: number;
  playedSeconds: number;
  /** Epoch milliseconds at which the session started. */
  startedAt: number;
  completed: boolean;
  /**
   * Whether this session passed the play threshold. Older backups and
   * phone exports may omit the flag; those plays are treated as counted.
   */
  counted?: boolean;
}

/** All-time aggregate for a track, artist or album. */
export interface ReplayCounter {
  /** `${kind}:${id}` — also the object-store key. */
  key: string;
  kind: ReplayCounterKind;
  id: string;
  name: string;
  artist?: string;
  artwork?: string;
  duration?: number;
  plays: number;
  seconds: number;
  lastPlayedAt: number;
}

/** One track/artist/album inside a day bucket. */
export interface DayEntity {
  title: string;
  artist?: string;
  artwork?: string;
  duration?: number;
  plays: number;
  seconds: number;
}

/** Daily bucket, keyed by local calendar date (`YYYY-MM-DD`). */
export interface ReplayDay {
  date: string;
  plays: number;
  seconds: number;
  tracks: Record<string, DayEntity>;
  artists: Record<string, DayEntity>;
  albums: Record<string, DayEntity>;
}

export interface ReplayActivityPoint {
  date: string;
  plays: number;
  seconds: number;
}

/** A ranked entry in a Replay summary. */
export interface ReplayTopItem {
  id: string;
  kind: ReplayCounterKind;
  name: string;
  artist?: string;
  artwork?: string;
  duration?: number;
  plays: number;
  seconds: number;
}

export interface ReplaySummary {
  range: ReplayRange;
  /** Epoch ms at the start of the range, or null for all time. */
  from: number | null;
  to: number;
  plays: number;
  seconds: number;
  completed: number;
  uniqueTracks: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  activeDays: number;
  topTracks: ReplayTopItem[];
  topArtists: ReplayTopItem[];
  topAlbums: ReplayTopItem[];
  /** 7 points for the week range, 30 points otherwise. */
  activity: ReplayActivityPoint[];
}

/** Portable backup payload. */
export interface ReplayBackup {
  format: 'rem-replay';
  version: 1;
  exportedAt: string;
  plays: PlayRecord[];
  counters: ReplayCounter[];
  days: ReplayDay[];
}

export interface ReplayImportResult {
  playsAdded: number;
  playsSkipped: number;
  counters: number;
  days: number;
  rebuilt: boolean;
}

/** Minimal track shape used by the recorder and aggregate helpers. */
export interface ReplayTrackMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
}

export interface ReplayDayEntitySource {
  id: string;
  title: string;
  artist?: string;
  artwork?: string;
  duration?: number;
}
