import { getApiBase } from '@/config';

export interface AddonManifest {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  source?: string;
  api?: { search?: string; stream?: string };
}

export interface Addon {
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

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20_000);
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error || '')
        : '';
      throw new Error(message || `Request failed (${res.status}).`);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The addon server took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function listAddons(): Promise<{ addons: Addon[] }> {
  return request('/addons');
}

export function addAddon(url: string): Promise<Addon> {
  return request('/addons', { method: 'POST', body: { url }, timeoutMs: 25_000 });
}

export function updateAddon(
  id: string,
  update: { enabled?: boolean; order?: number }
): Promise<Addon> {
  return request(`/addons/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: update,
  });
}

export function removeAddon(id: string): Promise<{ ok: boolean }> {
  return request(`/addons/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function refreshAddon(id: string): Promise<Addon> {
  return request(`/addons/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
}

export function searchAddons(query: string): Promise<{ query: string; tracks: AddonTrack[] }> {
  return request(`/addons/search?q=${encodeURIComponent(query)}`, { timeoutMs: 30_000 });
}

/** Server-proxied audio URL for an addon track. */
export function addonStreamUrl(addonId: string, trackId: string): string {
  return `${getApiBase()}/addons/stream/${encodeURIComponent(addonId)}/${encodeURIComponent(trackId)}`;
}
