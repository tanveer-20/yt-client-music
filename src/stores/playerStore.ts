/**
 * Player store — manages playback state, queue, and history.
 * Persists volume and queue to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track, RepeatMode, PlayerState } from '../types';
import { getSuggestions } from '../utils/api';
import { useSettingsStore } from './settingsStore';
import { useUIStore } from './uiStore';

interface PlayerStore {
  // ── Playback ──
  currentTrack: Track | null;
  state: PlayerState;
  progress: number;   // current time in seconds
  duration: number;    // total time in seconds
  volume: number;      // 0–1
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffled: boolean;

  // ── Queue ──
  queue: Track[];
  queueIndex: number;
  originalQueue: Track[];  // preserved for un-shuffle

  // ── History ──
  history: Track[];

  // ── Actions ──
  play: (track: Track) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playQueue: (tracks: Track[], startIndex?: number) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setState: (state: PlayerState) => void;
  reorderQueue: (from: number, to: number) => void;
}

/**
 * Fisher-Yates shuffle (immutable).
 */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function appendHistory(history: Track[], track: Track | null): Track[] {
  if (!track) return history;
  const filtered = history.filter((t) => t.id !== track.id);
  return [track, ...filtered].slice(0, 50);
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      // ── Initial State ──
      currentTrack: null,
      state: 'idle',
      progress: 0,
      duration: 0,
      volume: 0.8,
      isMuted: false,
      repeatMode: 'off',
      isShuffled: false,
      queue: [],
      queueIndex: -1,
      originalQueue: [],
      history: [],

      // ── Playback Actions ──

      play: (track) => {
        const { history } = get();
        const newHistory = appendHistory(history, track);

        set({
          currentTrack: track,
          state: 'loading',
          progress: 0,
          duration: 0,
          history: newHistory,
        });
      },

      pause: () => set({ state: 'paused' }),
      resume: () => set({ state: 'playing' }),

      next: () => {
        const { queue, queueIndex, repeatMode, currentTrack, history } = get();
        if (queue.length === 0) return;

        let nextIndex = queueIndex + 1;

        if (repeatMode === 'one') {
          // Replay current track
          set({ state: 'loading', progress: 0 });
          return;
        }

        if (nextIndex >= queue.length) {
          if (repeatMode === 'all') {
            nextIndex = 0;
          } else {
            // Check Auto-Play preference
            const autoPlay = useSettingsStore.getState().autoPlaySimilar;
            if (autoPlay && currentTrack) {
              getSuggestions(currentTrack.id)
                .then((suggestions) => {
                  if (suggestions && suggestions.length > 0) {
                    const state = get();
                    const updatedQueue = [...state.queue, ...suggestions];
                    set({
                      queue: updatedQueue,
                      originalQueue: [...state.originalQueue, ...suggestions],
                    });
                    get().next();
                  } else {
                    set({ state: 'paused' });
                  }
                })
                .catch(() => {
                  set({ state: 'paused' });
                });
              return;
            }

            // End of queue, stop
            set({ state: 'paused' });
            return;
          }
        }

        const targetTrack = queue[nextIndex];
        const newHistory = appendHistory(history, targetTrack);

        set({
          currentTrack: targetTrack,
          queueIndex: nextIndex,
          state: 'loading',
          progress: 0,
          duration: 0,
          history: newHistory,
        });
      },

      previous: () => {
        const { progress, history, queue, queueIndex } = get();

        // If more than 3 seconds in, restart the track
        if (progress > 3) {
          set({ progress: 0, state: 'loading' });
          return;
        }

        // Try going back in queue
        if (queueIndex > 0) {
          const prevIndex = queueIndex - 1;
          const targetTrack = queue[prevIndex];
          const newHistory = appendHistory(history, targetTrack);

          set({
            currentTrack: targetTrack,
            queueIndex: prevIndex,
            state: 'loading',
            progress: 0,
            duration: 0,
            history: newHistory,
          });
          return;
        }

        // Try history
        if (history.length > 0) {
          const [prev, ...rest] = history;
          set({
            currentTrack: prev,
            state: 'loading',
            progress: 0,
            duration: 0,
            history: rest,
          });
        }
      },

      seek: (time) => set({ progress: time }),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      setState: (state) => set({ state }),

      // ── Volume ──

      setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)), isMuted: false }),
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

      // ── Shuffle & Repeat ──

      toggleShuffle: () => {
        const { isShuffled, queue, originalQueue, queueIndex, currentTrack } = get();

        if (isShuffled) {
          // Restore original order
          const newIndex = currentTrack
            ? originalQueue.findIndex((t) => t.id === currentTrack.id)
            : 0;
          set({
            isShuffled: false,
            queue: originalQueue,
            queueIndex: newIndex >= 0 ? newIndex : 0,
          });
        } else {
          // Shuffle, keeping current track at current position
          const remaining = queue.filter((_, i) => i !== queueIndex);
          const shuffled = shuffle(remaining);
          const newQueue = currentTrack
            ? [currentTrack, ...shuffled]
            : shuffled;
          set({
            isShuffled: true,
            originalQueue: queue,
            queue: newQueue,
            queueIndex: 0,
          });
        }
      },

      cycleRepeat: () => {
        const modes: RepeatMode[] = ['off', 'all', 'one'];
        const { repeatMode } = get();
        const nextIdx = (modes.indexOf(repeatMode) + 1) % modes.length;
        set({ repeatMode: modes[nextIdx] });
      },

      // ── Queue ──

      addToQueue: (track) => {
        set((s) => ({
          queue: [...s.queue, track],
          originalQueue: [...s.originalQueue, track],
        }));
      },

      playNext: (track) => {
        const { queueIndex } = get();
        set((s) => {
          const q = [...s.queue];
          q.splice(queueIndex + 1, 0, track);
          return { queue: q, originalQueue: [...s.originalQueue, track] };
        });
      },

      removeFromQueue: (index) => {
        const { queueIndex } = get();
        set((s) => {
          const q = s.queue.filter((_, i) => i !== index);
          let newIndex = queueIndex;
          if (index < queueIndex) newIndex--;
          if (index === queueIndex) newIndex = Math.min(newIndex, q.length - 1);
          return { queue: q, queueIndex: newIndex };
        });
      },

      clearQueue: () => {
        set((s) => {
          // Keep only the currently playing track
          if (s.currentTrack) {
            return {
              queue: [s.currentTrack],
              originalQueue: [s.currentTrack],
              queueIndex: 0,
            };
          }
          return { queue: [], originalQueue: [], queueIndex: -1 };
        });
      },

      playQueue: (tracks, startIndex = 0) => {
        if (tracks.length === 0) return;
        const targetTrack = tracks[startIndex] || tracks[0];
        const { history } = get();
        const newHistory = appendHistory(history, targetTrack);

        set({
          queue: tracks,
          originalQueue: tracks,
          queueIndex: startIndex,
          currentTrack: targetTrack,
          state: 'loading',
          progress: 0,
          duration: 0,
          isShuffled: false,
          history: newHistory,
        });
      },

      reorderQueue: (from, to) => {
        set((s) => {
          const q = [...s.queue];
          const [moved] = q.splice(from, 1);
          q.splice(to, 0, moved);

          let newIndex = s.queueIndex;
          if (from === s.queueIndex) {
            newIndex = to;
          } else if (from < s.queueIndex && to >= s.queueIndex) {
            newIndex--;
          } else if (from > s.queueIndex && to <= s.queueIndex) {
            newIndex++;
          }

          return { queue: q, queueIndex: newIndex };
        });
      },
    }),
    {
      name: 'yt-music-player',
      partialize: (state) => ({
        volume: state.volume,
        isMuted: state.isMuted,
        repeatMode: state.repeatMode,
        isShuffled: state.isShuffled,
        queue: state.queue,
        queueIndex: state.queueIndex,
        originalQueue: state.originalQueue,
        history: state.history.slice(0, 20),
      }),
    }
  )
);
