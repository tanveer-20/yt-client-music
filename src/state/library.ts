import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@/types';

interface LibraryState {
  liked: Track[];
  recent: Track[];
  isLiked: (id: string) => boolean;
  toggleLike: (track: Track) => void;
  addRecent: (track: Track) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      liked: [],
      recent: [],
      isLiked: (id) => get().liked.some((t) => t.id === id),
      toggleLike: (track) =>
        set((state) => {
          const exists = state.liked.some((t) => t.id === track.id);
          return {
            liked: exists ? state.liked.filter((t) => t.id !== track.id) : [track, ...state.liked],
          };
        }),
      addRecent: (track) =>
        set((state) => {
          const next = [track, ...state.recent.filter((t) => t.id !== track.id)];
          return { recent: next.slice(0, 60) };
        }),
    }),
    { name: 'rem-library' }
  )
);
