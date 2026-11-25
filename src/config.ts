import { Capacitor } from '@capacitor/core';
import { useSettingsStore } from '@/state/settings';

/** Cloud API used by the Android app and the hosted web build. */
const CLOUD_API = 'https://rem-server-nwib.onrender.com/api';

/** Hosted web origin, which also serves the direct resolver for native builds. */
const WEB_ORIGIN = 'https://rem-mocha.vercel.app';

function normalizeBase(value: string): string {
  const clean = value.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

/** Base URL for the Rem proxy API. */
export function getApiBase(): string {
  const custom = useSettingsStore.getState().serverUrl?.trim();
  if (custom) return normalizeBase(custom);

  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (envUrl) return normalizeBase(envUrl);

  if (Capacitor.isNativePlatform()) return CLOUD_API;

  // The hosted web app talks to the cloud API. Local dev keeps the Vite
  // proxy, and a self-hosted build can point VITE_API_URL at its own server.
  if (typeof window !== 'undefined' && window.location.hostname === 'rem-mocha.vercel.app') {
    return CLOUD_API;
  }

  return '/api';
}

export function streamUrl(videoId: string): string {
  return `${getApiBase()}/stream/${encodeURIComponent(videoId)}`;
}

/**
 * Direct stream resolver.
 *
 * The companion extension resolves in-page when installed. Without it, this
 * endpoint resolves the URL from the cloud; googlevideo re-signs the returned
 * URL for the browser's own address (`ipbypass`), so audio still streams
 * directly from Google and never passes through the server.
 */
export function directUrl(videoId: string): string {
  const custom = useSettingsStore.getState().serverUrl?.trim();
  if (custom) return `${normalizeBase(custom)}/direct/${encodeURIComponent(videoId)}`;

  // The Android app cannot use a same-origin /api path; the hosted web app
  // exposes the same function publicly.
  if (Capacitor.isNativePlatform()) {
    return `${WEB_ORIGIN}/api/direct/${encodeURIComponent(videoId)}`;
  }

  return `/api/direct/${encodeURIComponent(videoId)}`;
}
