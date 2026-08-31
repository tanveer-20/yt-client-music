/**
 * Playlist store — create, edit, delete playlists.
 * Persisted to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Playlist, Track } from '../types';
import { uid } from '../utils/format';

interface PlaylistStore {
  playlists: Playlist[];
  favorites: Track[];
  createPlaylist: (name: string, tracks?: Track[]) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addTrack: (playlistId: string, track: Track) => void;
  removeTrack: (playlistId: string, trackId: string) => void;
  reorderTrack: (playlistId: string, from: number, to: number) => void;
  getPlaylist: (id: string) => Playlist | undefined;
  toggleFavorite: (track: Track) => boolean;
  isFavorite: (trackId: string) => boolean;
}

export const usePlaylistStore = create<PlaylistStore>()(
  persist(
    (set, get) => ({
      playlists: [],
      favorites: [],

      createPlaylist: (name, tracks = []) => {
        const id = uid();
        const now = Date.now();
        const playlist: Playlist = {
          id,
          name,
          tracks,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ playlists: [...s.playlists, playlist] }));
        return id;
      },

      deletePlaylist: (id) => {
        set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
      },

      renamePlaylist: (id, name) => {
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, name, updatedAt: Date.now() } : p
          ),
        }));
      },

      addTrack: (playlistId, track) => {
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            // Avoid duplicates
            if (p.tracks.some((t) => t.id === track.id)) return p;
            return {
              ...p,
              tracks: [...p.tracks, track],
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      removeTrack: (playlistId, trackId) => {
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              tracks: p.tracks.filter((t) => t.id !== trackId),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      reorderTrack: (playlistId, from, to) => {
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const tracks = [...p.tracks];
            const [moved] = tracks.splice(from, 1);
            tracks.splice(to, 0, moved);
            return { ...p, tracks, updatedAt: Date.now() };
          }),
        }));
      },

      getPlaylist: (id) => {
        return get().playlists.find((p) => p.id === id);
      },

      toggleFavorite: (track: Track) => {
        const { favorites } = get();
        const exists = favorites.some((t) => t.id === track.id);
        const newFavorites = exists
          ? favorites.filter((t) => t.id !== track.id)
          : [track, ...favorites];

        set({ favorites: newFavorites });
        return !exists;
      },

      isFavorite: (trackId: string) => {
        return get().favorites.some((t) => t.id === trackId);
      },
    }),
    { name: 'yt-music-playlists' }
  )
);
