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

  // ── Technical Info & Dialogs ──
  currentTechnicalDetails: TechnicalDetails | null;
  isTrackDetailsOpen: boolean;
  isLoadingDetails: boolean;

  // ── Actions ──
  setTheme: (theme: ThemeMode) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setAutoPlaySimilar: (enabled: boolean) => void;
  setNormalizeVolume: (enabled: boolean) => void;
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeToDOM(state.theme);
        }
      },
    }
  )
);
