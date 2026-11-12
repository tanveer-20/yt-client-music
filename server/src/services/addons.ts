/**
 * Addon HTTP sources.
 *
 * Rem addons are small web services exposing:
 *   GET {base}/manifest.json
 *   GET {base}/search?q=...
 *   GET {base}/stream/{id}
 *
 * URLs are normalised, requests have short timeouts, search results are
 * sanitised, and audio is proxied so Range requests keep working.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

export interface AddonManifest {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  source?: string;
  api?: { search?: string; stream?: string };
}

export interface StoredAddon {
  id: string;
  base: string;
  enabled: boolean;
  order: number;
  manifest: AddonManifest | null;
  status: 'ready' | 'error' | 'unreachable';
  error?: string;
  addedAt: number;
  refreshedAt: number;
}

export interface AddonTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration: number;
  addonId: string;
  source: string;
}

export class AddonError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AddonError';
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 12_000;
const STREAM_TIMEOUT_MS = 8_000;
const SEARCH_TTL_MS = 5 * 60_000;
const MAX_TRACKS_PER_ADDON = 100;
const MAX_TOTAL_TRACKS = 300;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '..', '..', 'data');
const configPath = path.join(dataDir, 'addons.json');

let addons: StoredAddon[] | null = null;
const searchCache = new Map<string, { at: number; value: AddonTrack[] }>();
const manifestCache = new Map<string, { at: number; value: AddonManifest }>();

function readAll(): StoredAddon[] {
  if (addons) return addons;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as StoredAddon[];
    addons = Array.isArray(parsed) ? parsed : [];
  } catch {
    addons = [];
  }
  return addons;
}

function writeAll(): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(readAll(), null, 2), 'utf8');
}

export function listAddons(): StoredAddon[] {
  return [...readAll()].sort((a, b) => a.order - b.order);
}

function makeId(raw: string): string {
  return raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[^a-z0-9.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 72);
}

export function validateBaseUrl(raw: string): string {
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = URL.parse(value);
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new AddonError(400, 'Addon URL must start with http:// or https://.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!(host === 'localhost' || host.endsWith('.localhost') || host.includes('.') || isIP(host) !== 0)) {
    throw new AddonError(400, 'Addon URL is missing a valid host.');
  }
  if (url.username || url.password) {
    throw new AddonError(400, 'Addon URLs must not contain credentials.');
  }
  value = `${url.origin}${url.pathname.replace(/\/manifest\.json$/i, '')}`;
  return value.replace(/\/+$/, '');
}

async function fetchJson<T>(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AddonError(502, 'The addon could not be reached.');
  }
  if (res.status === 404) throw new AddonError(404, 'The addon endpoint was not found.');
  if (!res.ok) throw new AddonError(502, `The addon returned ${res.status}.`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new AddonError(502, 'The addon did not return JSON.');
  }
}

export function normaliseManifest(value: unknown): AddonManifest {
  const candidate = (value as { addon?: unknown; name?: unknown }).addon ?? value;
  const data = candidate as Partial<AddonManifest> | null;
  if (!data || typeof data.name !== 'string' || !data.name.trim()) {
    throw new AddonError(502, 'The addon manifest is missing "name".');
  }
  const manifest: AddonManifest = { name: data.name.trim() };
  if (typeof data.version === 'string') manifest.version = data.version;
  if (typeof data.description === 'string') manifest.description = data.description;
  if (typeof data.author === 'string') manifest.author = data.author;
  if (typeof data.source === 'string') manifest.source = data.source;
  if (data.api && typeof data.api === 'object') {
    const api = data.api as { search?: unknown; stream?: unknown };
    manifest.api = {
      search: typeof api.search === 'string' ? api.search : undefined,
      stream: typeof api.stream === 'string' ? api.stream : undefined,
    };
  }
  return manifest;
}

export async function refreshAddon(id: string): Promise<StoredAddon> {
  const list = readAll();
  const addon = list.find((item) => item.id === id);
  if (!addon) throw new AddonError(404, 'Addon not found.');

  try {
    const manifest = normaliseManifest(await fetchJson(`${addon.base}/manifest.json`));
    addon.manifest = manifest;
    addon.status = 'ready';
    addon.error = undefined;
  } catch (error) {
    addon.status = 'unreachable';
    addon.error = error instanceof Error ? error.message : 'Manifest failed.';
  }
  addon.refreshedAt = Date.now();
  manifestCache.delete(addon.base);
  writeAll();
  return addon;
}

export async function addAddon(rawUrl: string): Promise<StoredAddon> {
  const base = validateBaseUrl(rawUrl);
  const list = readAll();
  if (list.some((item) => item.base === base)) {
    throw new AddonError(409, 'This addon URL has already been added.');
  }

  const addon: StoredAddon = {
    id: makeId(base),
    base,
    enabled: true,
    order: list.length,
    manifest: null,
    status: 'unreachable',
    addedAt: Date.now(),
    refreshedAt: 0,
  };
  list.push(addon);
  writeAll();
  const refreshed = await refreshAddon(addon.id);
  if (refreshed.status !== 'ready') {
    // Keep the entry so the user can inspect and retry it in the UI.
  }
  return refreshed;
}

export function removeAddon(id: string): void {
  const list = readAll();
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) throw new AddonError(404, 'Addon not found.');
  list.splice(index, 1);
  writeAll();
  searchCache.clear();
}

export function updateAddon(
  id: string,
  update: { enabled?: boolean; order?: number }
): StoredAddon {
  const list = readAll();
  const addon = list.find((item) => item.id === id);
  if (!addon) throw new AddonError(404, 'Addon not found.');

  if (typeof update.enabled === 'boolean') {
    addon.enabled = update.enabled;
    searchCache.clear();
  }
  if (typeof update.order === 'number' && Number.isFinite(update.order)) {
    const target = Math.max(0, Math.min(list.length - 1, Math.round(update.order)));
    list.splice(list.indexOf(addon), 1);
    list.splice(target, 0, addon);
    list.forEach((item, index) => {
      item.order = index;
    });
    writeAll();
  }
  return addon;
}

function asSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string') return 0;
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normaliseTrack(raw: Record<string, unknown>, addon: StoredAddon): AddonTrack | null {
  const id = text(raw.id) || text(raw.videoId) || text(raw.trackId);
  const title = text(raw.title) || text(raw.name);
  const artist = text(raw.artist) || text(raw.uploader) || text(raw.channel) || 'Unknown artist';
  if (!id || !title) return null;

  const album = text(raw.album) || undefined;
  const thumbnail =
    text(raw.thumbnail) || text(raw.artwork) || text(raw.image) || text(raw.cover) || undefined;
  return {
    id,
    title,
    artist,
    album,
    thumbnail,
    duration: asSeconds(raw.duration ?? raw.durationSec ?? raw.length),
    addonId: addon.id,
    source: addon.manifest?.name || addon.base,
  };
}

function extractTracks(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    for (const key of ['tracks', 'results', 'items', 'data']) {
      if (Array.isArray(node[key])) return node[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export async function searchAddon(addon: StoredAddon, query: string): Promise<AddonTrack[]> {
  if (!query.trim()) return [];
  const cacheKey = `${addon.id}:${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) return cached.value;

  const searchPath = addon.manifest?.api?.search || '/search';
  const url = `${addon.base}${searchPath.startsWith('/') ? searchPath : `/${searchPath}`}?q=${encodeURIComponent(query)}`;
  const tracks = extractTracks(await fetchJson(url))
    .slice(0, MAX_TRACKS_PER_ADDON)
    .map((item) => normaliseTrack(item, addon))
    .filter((track): track is AddonTrack => track !== null);
  searchCache.set(cacheKey, { at: Date.now(), value: tracks });
  return tracks;
}

export async function searchAddons(query: string, limit = MAX_TOTAL_TRACKS): Promise<AddonTrack[]> {
  const enabled = listAddons().filter((addon) => addon.enabled && addon.status === 'ready');
  const responses = await Promise.allSettled(enabled.map((addon) => searchAddon(addon, query)));
  const combined: AddonTrack[] = [];
  for (const result of responses) {
    if (result.status !== 'fulfilled') continue;
    for (const track of result.value) {
      if (combined.length >= limit) return combined;
      combined.push(track);
    }
  }
  return combined;
}

export function findAddon(id: string): StoredAddon {
  const addon = readAll().find((item) => item.id === id);
  if (!addon) throw new AddonError(404, 'Addon not found.');
  if (!addon.enabled) throw new AddonError(409, 'This addon is disabled.');
  return addon;
}

export async function resolveAddonStream(
  addon: StoredAddon,
  trackId: string,
  range?: string | null
): Promise<Response> {
  const streamPath = addon.manifest?.api?.stream || '/stream';
  const url = `${addon.base}${streamPath.startsWith('/') ? streamPath : `/${streamPath}`}/${encodeURIComponent(trackId)}`;
  try {
    return await fetch(url, {
      headers: {
        Accept: '*/*',
        ...(range ? { Range: range } : {}),
      },
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });
  } catch {
    throw new AddonError(502, 'The addon stream could not be reached.');
  }
}

export async function searchManifests(base: string): Promise<AddonManifest> {
  const cached = manifestCache.get(base);
  if (cached && Date.now() - cached.at < SEARCH_TTL_MS) return cached.value;
  const manifest = normaliseManifest(await fetchJson(`${base}/manifest.json`));
  manifestCache.set(base, { at: Date.now(), value: manifest });
  return manifest;
}
