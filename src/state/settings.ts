import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'high' | 'medium';

interface SettingsState {
  serverUrl: string;
  crossfadeSec: number;
  autoplaySimilar: boolean;
  quality: Quality;
  skipSilence: boolean;
  showNerdStats: boolean;
  setServerUrl: (url: string) => void;
  setCrossfadeSec: (sec: number) => void;
  setAutoplaySimilar: (on: boolean) => void;
  setQuality: (q: Quality) => void;
  setSkipSilence: (on: boolean) => void;
  setShowNerdStats: (on: boolean) => void;
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
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setCrossfadeSec: (crossfadeSec) => set({ crossfadeSec }),
      setAutoplaySimilar: (autoplaySimilar) => set({ autoplaySimilar }),
      setQuality: (quality) => set({ quality }),
      setSkipSilence: (skipSilence) => set({ skipSilence }),
      setShowNerdStats: (showNerdStats) => set({ showNerdStats }),
    }),
    { name: 'rem-settings' }
  )
);
