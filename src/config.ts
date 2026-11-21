import { Capacitor } from '@capacitor/core';
import { useSettingsStore } from '@/state/settings';

/** Cloud API used by the Android app and the hosted web build. */
const CLOUD_API = 'https://rem-server-nwib.onrender.com/api';

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
