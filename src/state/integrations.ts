import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DiscordStatus,
  SpotifyImportResult,
  SpotifyStatus,
} from '@/data/integrations/api';

interface IntegrationsState {
  /** Connection flags are the only Spotify state persisted across reloads. */
  spotifyConnected: boolean;
  spotifyAnonymous: boolean;
  spotifyTokenExpiresAt: number | null;
  lastImport: SpotifyImportResult | null;

  /** Discord connection flag is persisted so the landing page is useful offline. */
  discordConnected: boolean;
  discordStatus: DiscordStatus | null;
  discordShareNowPlaying: boolean;

  setSpotifyStatus: (status: SpotifyStatus) => void;
  clearSpotify: () => void;
  setLastImport: (result: SpotifyImportResult | null) => void;
  setDiscordStatus: (status: DiscordStatus) => void;
  clearDiscord: () => void;
  setDiscordShareNowPlaying: (enabled: boolean) => void;
}

export const useIntegrationsStore = create<IntegrationsState>()(
  persist(
    (set) => ({
      spotifyConnected: false,
      spotifyAnonymous: false,
      spotifyTokenExpiresAt: null,
      lastImport: null,

      discordConnected: false,
      discordStatus: null,
      discordShareNowPlaying: true,

      setSpotifyStatus: (status) =>
        set({
          spotifyConnected: status.connected,
          spotifyAnonymous: status.anonymous,
          spotifyTokenExpiresAt: status.tokenExpiresAt,
        }),

      clearSpotify: () =>
        set({
          spotifyConnected: false,
          spotifyAnonymous: false,
          spotifyTokenExpiresAt: null,
        }),

      setLastImport: (lastImport) => set({ lastImport }),

      setDiscordStatus: (discordStatus) =>
        set({
          discordStatus,
          discordConnected: discordStatus.connected,
        }),

      clearDiscord: () =>
        set({
          discordConnected: false,
          discordStatus: null,
        }),

      setDiscordShareNowPlaying: (discordShareNowPlaying) =>
        set({ discordShareNowPlaying }),
    }),
    {
      name: 'rem-integrations',
      // Credentials (sp_dc / Discord token) are never stored here. Only
      // connection flags and non-sensitive import results survive a reload.
      partialize: (state) => ({
        spotifyConnected: state.spotifyConnected,
        spotifyAnonymous: state.spotifyAnonymous,
        lastImport: state.lastImport,
        discordConnected: state.discordConnected,
        discordShareNowPlaying: state.discordShareNowPlaying,
      }),
    }
  )
);
