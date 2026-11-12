import { key, newCounter, newDay, readDays, readPlays, readCounters, upsertCounter, upsertDay, clearAll } from './db';
import type { PlayRecord, ReplayBackup, ReplayDay, ReplayRange, ReplaySummary, ReplayTopItem, ReplayTrackMeta } from './types';

const COUNT_THRESHOLD_SECONDS = 30;
const COMPLETE_RATIO = 0.9;
const MAX_TICK_SECONDS = 30;

interface Session {
  trackId: string;
  startedAt: number;
  lastProgress: number;
  played: number;
  counted: boolean;
  completed: boolean;
}

let session: Session | null = null;

function localDate(input: number | Date = new Date()): string {
  const date = new Date(input);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function resetSession(): void {
  session = null;
}

export async function recordTick(track: ReplayTrackMeta, progressSeconds: number): Promise<void> {
  if (!track?.id || !Number.isFinite(progressSeconds) || progressSeconds < 0) return;

  if (!session || session.trackId !== track.id) {
    session = {
      trackId: track.id,
      startedAt: Date.now(),
      lastProgress: progressSeconds,
      played: 0,
      counted: false,
      completed: false,
    };
  }

  const delta = progressSeconds - session.lastProgress;
  if (delta < 0) {
    session.lastProgress = progressSeconds;
    return;
  }
  if (delta > MAX_TICK_SECONDS) {
    // A large jump is a seek, not listening time.
    session.lastProgress = progressSeconds;
    return;
  }

  session.lastProgress = progressSeconds;
  session.played += delta;
  const duration = track.duration || 0;
  const threshold = duration > 0 ? Math.min(COUNT_THRESHOLD_SECONDS, duration * 0.5) : COUNT_THRESHOLD_SECONDS;

  if (!session.counted && session.played >= threshold) {
    session.counted = true;
    await countPlay(track, session.played, session.completed || progressSeconds >= duration * COMPLETE_RATIO);
  } else if (session.counted && !session.completed && duration > 0 && progressSeconds / duration >= COMPLETE_RATIO) {
    session.completed = true;
    await markCompleted(track, progressSeconds);
  }
}

async function loadDay(date: string): Promise<ReplayDay> {
  const days = await readDays();
  return days.find((day) => day.date === date) || newDay(date);
}

async function saveDay(day: ReplayDay): Promise<void> {
  await upsertDay(day);
}

async function bumpCounter(
  kind: 'track' | 'artist' | 'album',
  id: string,
  name: string,
  artist: string | undefined,
  artwork: string | undefined,
  duration: number | undefined,
  seconds: number
): Promise<void> {
  if (!id || !name) return;
  const counters = await readCounters();
  const counter = counters.find((item) => item.key === key(kind, id))
    || newCounter(kind, id, name, artist, artwork, duration);
  counter.plays += 1;
  counter.seconds += Math.max(0, seconds);
  counter.lastPlayedAt = Date.now();
  if (artwork) counter.artwork = artwork;
  if (artist && kind === 'album') counter.artist = artist;
  await upsertCounter(counter);
}

async function countPlay(track: ReplayTrackMeta, seconds: number, completed: boolean): Promise<void> {
  const date = localDate();
  const day = await loadDay(date);
  const safeSeconds = Math.max(0, seconds);

  day.plays += 1;
  day.seconds += safeSeconds;
  for (const [bucket, id, name, artist, artwork, duration] of [
    [day.tracks, track.id, track.title, track.artist, track.thumbnail, track.duration],
    [day.artists, track.artist, track.artist, undefined, track.thumbnail, undefined],
    [day.albums, track.album || `unknown:${track.artist}`, track.album || 'Unknown album', track.artist, track.thumbnail, undefined],
  ] as const) {
    const entry = bucket[id] || {
      title: name,
      artist,
      artwork,
      duration,
      plays: 0,
      seconds: 0,
    };
    entry.plays += 1;
    entry.seconds += safeSeconds;
    bucket[id] = entry;
  }

  await saveDay(day);
  await bumpCounter('track', track.id, track.title, track.artist, track.thumbnail, track.duration, safeSeconds);
  await bumpCounter('artist', track.artist, track.artist, undefined, track.thumbnail, undefined, safeSeconds);
  if (track.album) {
    await bumpCounter('album', track.album, track.album, track.artist, track.thumbnail, undefined, safeSeconds);
  }

  const play: PlayRecord = {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.thumbnail,
    duration: track.duration || 0,
    playedSeconds: safeSeconds,
    startedAt: session?.startedAt || Date.now(),
    completed,
    counted: true,
  };
  await appendPlay(play);
}

async function appendPlay(play: PlayRecord): Promise<void> {
  const { replayDb } = await import('./db');
  const db = await replayDb();
  void db.add('plays', play);
}

async function markCompleted(track: ReplayTrackMeta, progressSeconds: number): Promise<void> {
  const date = localDate();
  const day = await loadDay(date);
  const entry = day.tracks[track.id];
  const extra = Math.max(0, progressSeconds - (session?.lastProgress ?? 0));
  if (entry) {
    entry.seconds += extra;
    day.seconds += extra;
    await saveDay(day);
  }
}

function rangeStart(range: ReplayRange, now = Date.now()): number | null {
  const date = new Date(now);
  if (range === 'week') return date.getTime() - 7 * 86_400_000;
  if (range === 'month') return date.getTime() - 30 * 86_400_000;
  if (range === 'year') return date.getTime() - 365 * 86_400_000;
  return null;
}

function topItems(
  entries: ReplayDay[],
  bucket: 'tracks' | 'artists' | 'albums',
  kind: 'track' | 'artist' | 'album',
  limit = 10
): ReplayTopItem[] {
  const map = new Map<string, ReplayTopItem>();
  for (const day of entries) {
    for (const [id, entry] of Object.entries(day[bucket])) {
      const current = map.get(id) || {
        id,
        kind,
        name: entry.title,
        artist: entry.artist,
        artwork: entry.artwork,
        duration: entry.duration,
        plays: 0,
        seconds: 0,
      };
      current.plays += entry.plays;
      current.seconds += entry.seconds;
      map.set(id, current);
    }
  }
  return [...map.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds).slice(0, limit);
}

export async function getReplaySummary(range: ReplayRange): Promise<ReplaySummary> {
  const [days, counters] = await Promise.all([readDays(), readCounters()]);
  const from = rangeStart(range);
  const now = Date.now();
  const scoped = from === null ? days : days.filter((day) => new Date(`${day.date}T00:00:00`).getTime() >= from);

  const activity = scoped
    .map((day) => ({ date: day.date, plays: day.plays, seconds: day.seconds }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(range === 'week' || range === 'month' ? -30 : -365);

  const plays = scoped.reduce((sum, day) => sum + day.plays, 0);
  const seconds = scoped.reduce((sum, day) => sum + day.seconds, 0);
  const trackKeys = scoped.flatMap((day) => Object.keys(day.tracks));
  const artistKeys = scoped.flatMap((day) => Object.keys(day.artists));
  const albumKeys = scoped.flatMap((day) => Object.keys(day.albums));

  return {
    range,
    from,
    to: now,
    plays,
    seconds,
    completed: counters.filter((counter) => counter.kind === 'track').reduce((sum, counter) => sum + counter.plays, 0),
    uniqueTracks: new Set(trackKeys).size,
    uniqueArtists: new Set(artistKeys).size,
    uniqueAlbums: new Set(albumKeys).size,
    activeDays: scoped.filter((day) => day.plays > 0).length,
    topTracks: topItems(scoped, 'tracks', 'track'),
    topArtists: topItems(scoped, 'artists', 'artist'),
    topAlbums: topItems(scoped, 'albums', 'album'),
    activity,
  };
}

export async function getRecentPlays(limit = 50): Promise<PlayRecord[]> {
  return readPlays(limit);
}

export async function exportBackup(): Promise<ReplayBackup> {
  const [plays, counters, days] = await Promise.all([readPlays(10_000), readCounters(), readDays()]);
  return { format: 'rem-replay', version: 1, exportedAt: new Date().toISOString(), plays, counters, days };
}

export async function importBackup(input: unknown): Promise<{ plays: number; counters: number; days: number }> {
  const backup = input as ReplayBackup | null;
  if (!backup || backup.format !== 'rem-replay' || !Array.isArray(backup.plays)) {
    throw new Error('That file is not a valid Rem replay backup.');
  }
  const { replayDb } = await import('./db');
  const db = await replayDb();
  const plays = backup.plays.filter((play) => play && play.trackId).slice(0, 10_000);
  const counters = Array.isArray(backup.counters) ? backup.counters : [];
  const days = Array.isArray(backup.days) ? backup.days : [];

  const tx = db.transaction(['plays', 'counters', 'days'], 'readwrite');
  for (const play of plays) void tx.objectStore('plays').add(play);
  for (const counter of counters) if (counter?.key) void tx.objectStore('counters').put(counter, counter.key);
  for (const day of days) if (day?.date) void tx.objectStore('days').put(day, day.date);
  await tx.done;

  return { plays: plays.length, counters: counters.length, days: days.length };
}

export async function clearReplay(): Promise<void> {
  resetSession();
  await clearAll();
}
