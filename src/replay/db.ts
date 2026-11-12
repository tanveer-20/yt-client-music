import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PlayRecord, ReplayCounter, ReplayDay } from './types';

interface ReplayDB extends DBSchema {
  plays: { key: number; value: PlayRecord };
  counters: { key: string; value: ReplayCounter };
  days: { key: string; value: ReplayDay };
}

let dbPromise: Promise<IDBPDatabase<ReplayDB>> | null = null;

export function replayDb(): Promise<IDBPDatabase<ReplayDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ReplayDB>('rem-replay', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('plays')) db.createObjectStore('plays', { autoIncrement: true });
        if (!db.objectStoreNames.contains('counters')) db.createObjectStore('counters');
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days');
      },
    });
  }
  return dbPromise;
}

function key(kind: 'track' | 'artist' | 'album', id: string): string {
  return `${kind}:${id}`;
}

function newDay(date: string): ReplayDay {
  return { date, plays: 0, seconds: 0, tracks: {}, artists: {}, albums: {} };
}

function newCounter(
  kind: 'track' | 'artist' | 'album',
  id: string,
  name: string,
  artist?: string,
  artwork?: string,
  duration?: number
): ReplayCounter {
  return { key: key(kind, id), kind, id, name, artist, artwork, duration, plays: 0, seconds: 0, lastPlayedAt: 0 };
}

export async function readCounters(): Promise<ReplayCounter[]> {
  const db = await replayDb();
  return db.getAll('counters');
}

export async function readDays(): Promise<ReplayDay[]> {
  const db = await replayDb();
  return db.getAll('days');
}

export async function readPlays(limit = 100): Promise<PlayRecord[]> {
  const db = await replayDb();
  const all = await db.getAll('plays');
  return all
    .filter((play) => play.counted !== false)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

export async function addPlays(records: PlayRecord[]): Promise<void> {
  const db = await replayDb();
  const tx = db.transaction('plays', 'readwrite');
  for (const record of records) {
    void tx.store.add(record);
  }
  await tx.done;
}

export async function upsertCounter(counter: ReplayCounter): Promise<void> {
  const db = await replayDb();
  void db.put('counters', counter, counter.key);
}

export async function upsertDay(day: ReplayDay): Promise<void> {
  const db = await replayDb();
  void db.put('days', day, day.date);
}

export async function clearAll(): Promise<void> {
  const db = await replayDb();
  const tx = db.transaction(['plays', 'counters', 'days'], 'readwrite');
  void tx.objectStore('plays').clear();
  void tx.objectStore('counters').clear();
  void tx.objectStore('days').clear();
  await tx.done;
}

export { key, newCounter, newDay };
