import { Capacitor } from '@capacitor/core';
import { useSettingsStore } from '@/state/settings';

/** Base URL for the Rem proxy API. */
export function getApiBase(): string {
  const custom = useSettingsStore.getState().serverUrl?.trim();
  if (custom) {
    const clean = custom.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  if (Capacitor.isNativePlatform()) {
    return 'https://rem-server-nwib.onrender.com/api';
  }

  return '/api';
}

export function streamUrl(videoId: string): string {
  return `${getApiBase()}/stream/${encodeURIComponent(videoId)}`;
}
