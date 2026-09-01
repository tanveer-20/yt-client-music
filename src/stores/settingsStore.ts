/**
 * Settings store — manages user preferences (theme, audio quality, auto-play)
 * and technical details for the currently active track.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode, AudioQuality, TrackInfo } from '../types';

export interface TechnicalDetails {
  videoId: string;
  title: string;
  artist: string;
  codec: string;
  bitrate: string;
  format: string;
  sampleRate: string;
  channels: string;
  source: string;
  views?: number;
  uploadDate?: string;
}

interface SettingsStore {
  // ── Preferences ──
  theme: ThemeMode;
  audioQuality: AudioQuality;
  autoPlaySimilar: boolean;
  normalizeVolume: boolean;

  // ── Server & Network ──
  serverUrl: string;
  serverStatus: 'connected' | 'disconnected' | 'checking';
  serverPingMs: number | null;

  // ── Technical Info & Dialogs ──
  currentTechnicalDetails: TechnicalDetails | null;
  isTrackDetailsOpen: boolean;
  isLoadingDetails: boolean;

  // ── Actions ──
  setTheme: (theme: ThemeMode) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setAutoPlaySimilar: (enabled: boolean) => void;
  setNormalizeVolume: (enabled: boolean) => void;
  setServerUrl: (url: string) => void;
  setServerStatus: (status: 'connected' | 'disconnected' | 'checking', pingMs?: number | null) => void;
  checkConnection: (customUrl?: string) => Promise<{ ok: boolean; message: string; pingMs?: number }>;
  setTechnicalDetails: (details: TechnicalDetails | null) => void;
  setTrackDetailsOpen: (open: boolean) => void;
  setIsLoadingDetails: (loading: boolean) => void;
}

function applyThemeToDOM(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'oled');

  if (theme === 'light') {
    root.classList.add('light');
  } else if (theme === 'oled') {
    root.classList.add('dark', 'oled');
  } else {
    // Midnight dark
    root.classList.add('dark');
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: 'oled',
      audioQuality: 'high',
      autoPlaySimilar: true,
      normalizeVolume: false,
      serverUrl: '',
      serverStatus: 'disconnected',
      serverPingMs: null,
      currentTechnicalDetails: null,
      isTrackDetailsOpen: false,
      isLoadingDetails: false,

      setTheme: (theme) => {
        set({ theme });
        applyThemeToDOM(theme);
      },

      setAudioQuality: (audioQuality) => set({ audioQuality }),
      setAutoPlaySimilar: (autoPlaySimilar) => set({ autoPlaySimilar }),
      setNormalizeVolume: (normalizeVolume) => set({ normalizeVolume }),
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setServerStatus: (serverStatus, serverPingMs = null) => set({ serverStatus, serverPingMs }),

      checkConnection: async (customUrl?: string) => {
        const url = (customUrl !== undefined ? customUrl : get().serverUrl).trim();
        let targetBase = url ? url.replace(/\/+$/, '') : '';
        if (targetBase && !targetBase.endsWith('/api')) {
          targetBase = `${targetBase}/api`;
        }
        const endpoint = targetBase ? `${targetBase}/health` : '/api/health';

        set({ serverStatus: 'checking' });
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);

          const res = await fetch(endpoint, { signal: controller.signal });
          clearTimeout(timeout);

          const pingMs = Date.now() - start;
          const contentType = res.headers.get('content-type') || '';

          if (res.ok && contentType.includes('application/json')) {
            const data = await res.json();
            if (data.status === 'ok') {
              set({ serverStatus: 'connected', serverPingMs: pingMs });
              return { ok: true, message: `Connected (${pingMs}ms)`, pingMs };
            }
          }

          set({ serverStatus: 'disconnected', serverPingMs: null });
          return { ok: false, message: `Server replied with status ${res.status}` };
        } catch (err: any) {
          set({ serverStatus: 'disconnected', serverPingMs: null });
          const msg = err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Cannot reach server');
          return { ok: false, message: msg };
        }
      },

      setTechnicalDetails: (currentTechnicalDetails) => set({ currentTechnicalDetails }),
      setTrackDetailsOpen: (isTrackDetailsOpen) => set({ isTrackDetailsOpen }),
      setIsLoadingDetails: (isLoadingDetails) => set({ isLoadingDetails }),
    }),
    {
      name: 'yt-music-settings',
      partialize: (state) => ({
        theme: state.theme,
        audioQuality: state.audioQuality,
        autoPlaySimilar: state.autoPlaySimilar,
        normalizeVolume: state.normalizeVolume,
        serverUrl: state.serverUrl,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeToDOM(state.theme);
          // Auto-check connection on load
          state.checkConnection().catch(() => {});
        }
      },
    }
  )
);
