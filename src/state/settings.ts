import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'high' | 'medium';
export type Theme = 'system' | 'light' | 'dark';

interface SettingsState {
  serverUrl: string;
  crossfadeSec: number;
  autoplaySimilar: boolean;
  quality: Quality;
  skipSilence: boolean;
  showNerdStats: boolean;
  theme: Theme;
  setServerUrl: (url: string) => void;
  setCrossfadeSec: (sec: number) => void;
  setAutoplaySimilar: (on: boolean) => void;
  setQuality: (q: Quality) => void;
  setSkipSilence: (on: boolean) => void;
  setShowNerdStats: (on: boolean) => void;
  setTheme: (theme: Theme) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: '',
      crossfadeSec: 4,
      autoplaySimilar: true,
      quality: 'high',
      skipSilence: false,
      showNerdStats: false,
      theme: 'system',
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setCrossfadeSec: (crossfadeSec) => set({ crossfadeSec }),
      setAutoplaySimilar: (autoplaySimilar) => set({ autoplaySimilar }),
      setQuality: (quality) => set({ quality }),
      setSkipSilence: (skipSilence) => set({ skipSilence }),
      setShowNerdStats: (showNerdStats) => set({ showNerdStats }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'rem-settings' }
  )
);
