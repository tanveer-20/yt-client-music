/**
 * UI store — manages current view, search state, and panel visibility.
 */

import { create } from 'zustand';
import type { View } from '../types';

interface UIStore {
  currentView: View;
  searchQuery: string;
  isQueueOpen: boolean;
  isNowPlayingOpen: boolean;
  activePlaylistId: string | null;
  isSidebarOpen: boolean;

  setView: (view: View) => void;
  setSearchQuery: (query: string) => void;
  toggleQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  toggleNowPlaying: () => void;
  setNowPlayingOpen: (open: boolean) => void;
  setActivePlaylistId: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  navigateToPlaylist: (id: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentView: 'home',
  searchQuery: '',
  isQueueOpen: false,
  isNowPlayingOpen: false,
  activePlaylistId: null,
  isSidebarOpen: false,

  setView: (view) => set({ currentView: view, isSidebarOpen: false }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleQueue: () => set((s) => ({ isQueueOpen: !s.isQueueOpen })),
  setQueueOpen: (open) => set({ isQueueOpen: open }),

  toggleNowPlaying: () => set((s) => ({ isNowPlayingOpen: !s.isNowPlayingOpen })),
  setNowPlayingOpen: (open) => set({ isNowPlayingOpen: open }),

  setActivePlaylistId: (id) => set({ activePlaylistId: id }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),

  navigateToPlaylist: (id) =>
    set({
      currentView: 'playlist-detail',
      activePlaylistId: id,
      isSidebarOpen: false,
    }),
}));
