import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccountMode = 'signedOut' | 'extension' | 'manual' | 'error';

export interface AccountInfo {
  mode: AccountMode;
  connected: boolean;
  channelName?: string;
  avatarUrl?: string;
  error?: string;
  lastSyncAt?: number;
}

interface AccountState extends AccountInfo {
  setAccount: (info: AccountInfo) => void;
  setError: (message: string) => void;
  signOut: () => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      mode: 'signedOut',
      connected: false,
      setAccount: (info) => set({ ...info, error: undefined, lastSyncAt: Date.now() }),
      setError: (message) => set({ mode: 'error', connected: false, error: message }),
      signOut: () => set({ mode: 'signedOut', connected: false, channelName: undefined, avatarUrl: undefined, error: undefined }),
    }),
    {
      name: 'rem-account',
      partialize: (state) => ({
        mode: state.mode,
        connected: state.connected,
        channelName: state.channelName,
        avatarUrl: state.avatarUrl,
        lastSyncAt: state.lastSyncAt,
      }),
    }
  )
);
