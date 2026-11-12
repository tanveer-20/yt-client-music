import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@/types';

export interface LocalPlaylist {
  id: string;
  title: string;
  description?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

interface LocalLibraryState {
  playlists: LocalPlaylist[];
  create: (title: string, description?: string) => LocalPlaylist | null;
  rename: (id: string, title: string, description?: string) => void;
  remove: (id: string) => void;
  addTrack: (id: string, track: Track) => void;
  removeTrack: (id: string, trackId: string) => void;
}

function uid(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useLocalPlaylists = create<LocalLibraryState>()(
  persist(
    (set, get) => ({
      playlists: [],
      create(title, description) {
        const value = title.trim();
        if (!value) return null;
        const playlist: LocalPlaylist = {
          id: uid(),
          title: value,
          description,
          tracks: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ playlists: [playlist, ...state.playlists] }));
        return playlist;
      },
      rename(id, title, description) {
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === id
              ? { ...playlist, title: title.trim() || playlist.title, description, updatedAt: Date.now() }
              : playlist
          ),
        }));
      },
      remove(id) {
        set((state) => ({ playlists: state.playlists.filter((playlist) => playlist.id !== id) }));
      },
      addTrack(id, track) {
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === id && !playlist.tracks.some((item) => item.id === track.id)
              ? { ...playlist, tracks: [...playlist.tracks, track], updatedAt: Date.now() }
              : playlist
          ),
        }));
      },
      removeTrack(id, trackId) {
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === id
              ? { ...playlist, tracks: playlist.tracks.filter((track) => track.id !== trackId), updatedAt: Date.now() }
              : playlist
          ),
        }));
      },
    }),
    { name: 'rem-local-playlists' }
  )
);

export function playlistTrackCount(playlists: LocalPlaylist[]): number {
  return playlists.reduce((sum, playlist) => sum + playlist.tracks.length, 0);
}

export function getLocalPlaylist(playlists: LocalPlaylist[], id: string): LocalPlaylist | null {
  return playlists.find((playlist) => playlist.id === id) || null;
}
