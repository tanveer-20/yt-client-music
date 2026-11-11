import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlaybackState, RepeatMode, Track } from '@/types';
import { useLibraryStore } from './library';

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface PlayerState {
  queue: Track[];
  originalQueue: Track[] | null;
  queueIndex: number;
  currentTrack: Track | null;
  state: PlaybackState;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  playbackRate: number;
  playRequestId: number;
  seekNonce: number;
  seekTarget: number;
  contextLabel: string;
  sleepTimerEndsAt: number | null;

  playQueue: (tracks: Track[], startIndex?: number, label?: string) => void;
  playTrack: (track: Track, context?: Track[], label?: string) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: (auto?: boolean) => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setPlaybackRate: (rate: number) => void;
  enqueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeAt: (index: number) => void;
  moveItem: (from: number, to: number) => void;
  clearQueue: () => void;
  setSleepTimer: (minutes: number | null) => void;

  setState: (state: PlaybackState) => void;
  setProgress: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  advanceFromCrossfade: (index: number, track: Track) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      originalQueue: null,
      queueIndex: -1,
      currentTrack: null,
      state: 'idle',
      progress: 0,
      duration: 0,
      volume: 0.85,
      muted: false,
      shuffle: false,
      repeat: 'off',
      playbackRate: 1,
      playRequestId: 0,
      seekNonce: 0,
      seekTarget: 0,
      contextLabel: '',
      sleepTimerEndsAt: null,

      playQueue: (tracks, startIndex = 0, label = '') => {
        if (!tracks.length) return;
        const index = Math.max(0, Math.min(startIndex, tracks.length - 1));
        const track = tracks[index];
        useLibraryStore.getState().addRecent(track);
        set((s) => ({
          queue: tracks,
          originalQueue: null,
          queueIndex: index,
          currentTrack: track,
          state: 'loading',
          progress: 0,
          duration: track.duration || 0,
          playRequestId: s.playRequestId + 1,
          contextLabel: label,
        }));
      },

      playTrack: (track, context, label) => {
        get().playQueue(context && context.length ? context : [track], context?.findIndex((t) => t.id === track.id) ?? 0, label);
      },

      togglePlay: () => {
        const { state, currentTrack } = get();
        if (!currentTrack) return;
        if (state === 'playing') get().pause();
        else get().play();
      },

      play: () => {
        const { currentTrack, state } = get();
        if (!currentTrack) return;
        if (state === 'idle' || state === 'paused') {
          if (state === 'idle') {
            set((s) => ({ playRequestId: s.playRequestId + 1, state: 'loading' }));
          } else {
            set({ state: 'playing' });
          }
        }
      },

      pause: () => {
        if (get().state === 'playing' || get().state === 'loading') set({ state: 'paused' });
      },

      next: (auto = false) => {
        const { queue, queueIndex, repeat } = get();
        if (!queue.length) return;
        if (auto && repeat === 'one') {
          set((s) => ({ progress: 0, seekTarget: 0, seekNonce: s.seekNonce + 1, state: 'playing' }));
          return;
        }
        let nextIndex = queueIndex + 1;
        if (nextIndex >= queue.length) {
          if (repeat === 'all') nextIndex = 0;
          else {
            if (auto) set({ state: 'paused', progress: 0 });
            return;
          }
        }
        const track = queue[nextIndex];
        useLibraryStore.getState().addRecent(track);
        set((s) => ({
          queueIndex: nextIndex,
          currentTrack: track,
          state: 'loading',
          progress: 0,
          duration: track.duration || 0,
          playRequestId: s.playRequestId + 1,
        }));
      },

      previous: () => {
        const { progress, queue, queueIndex } = get();
        if (progress > 4) {
          get().seek(0);
          return;
        }
        const prevIndex = queueIndex > 0 ? queueIndex - 1 : 0;
        if (prevIndex === queueIndex) {
          get().seek(0);
          return;
        }
        const track = queue[prevIndex];
        set((s) => ({
          queueIndex: prevIndex,
          currentTrack: track,
          state: 'loading',
          progress: 0,
          duration: track.duration || 0,
          playRequestId: s.playRequestId + 1,
        }));
      },

      seek: (seconds) => {
        const duration = get().duration;
        const target = Math.max(0, Math.min(seconds, duration || seconds));
        set((s) => ({ progress: target, seekTarget: target, seekNonce: s.seekNonce + 1 }));
      },

      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)), muted: false }),

      toggleMute: () => set((s) => ({ muted: !s.muted })),

      toggleShuffle: () => {
        const { shuffle, queue, queueIndex, currentTrack } = get();
        if (!shuffle) {
          const rest = queue.filter((_, i) => i !== queueIndex);
          const randomized = shuffled(rest);
          const newQueue = currentTrack ? [currentTrack, ...randomized] : randomized;
          set({ shuffle: true, originalQueue: queue, queue: newQueue, queueIndex: 0 });
        } else {
          const original = get().originalQueue ?? queue;
          const idx = currentTrack ? original.findIndex((t) => t.id === currentTrack.id) : 0;
          set({
            shuffle: false,
            queue: original,
            originalQueue: null,
            queueIndex: idx >= 0 ? idx : 0,
          });
        }
      },

      cycleRepeat: () =>
        set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

      setPlaybackRate: (playbackRate) => set({ playbackRate }),

      enqueue: (track) =>
        set((s) => {
          const exists = s.queue.some((t) => t.id === track.id);
          if (exists) return s;
          return { queue: [...s.queue, track] };
        }),

      playNext: (track) =>
        set((s) => {
          if (!s.queue.length) {
            return {
              queue: [track],
              queueIndex: 0,
              currentTrack: track,
              state: 'loading' as PlaybackState,
              playRequestId: s.playRequestId + 1,
            };
          }
          const filtered = s.queue.filter((t) => t.id !== track.id);
          const insertAt = s.queueIndex + 1;
          const queue = [...filtered.slice(0, insertAt), track, ...filtered.slice(insertAt)];
          return { queue };
        }),

      removeAt: (index) =>
        set((s) => {
          if (index < 0 || index >= s.queue.length) return s;
          const queue = s.queue.filter((_, i) => i !== index);
          if (!queue.length) {
            return { ...s, queue: [], queueIndex: -1, currentTrack: null, state: 'idle', progress: 0, duration: 0 };
          }
          if (index < s.queueIndex) return { ...s, queue, queueIndex: s.queueIndex - 1 };
          if (index === s.queueIndex) {
            const newIndex = Math.min(index, queue.length - 1);
            return {
              ...s,
              queue,
              queueIndex: newIndex,
              currentTrack: queue[newIndex],
              state: 'loading',
              progress: 0,
              playRequestId: s.playRequestId + 1,
            };
          }
          return { ...s, queue };
        }),

      moveItem: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length) return s;
          const queue = [...s.queue];
          const [item] = queue.splice(from, 1);
          queue.splice(to, 0, item);
          let queueIndex = s.queueIndex;
          if (s.queueIndex === from) queueIndex = to;
          else if (from < s.queueIndex && to >= s.queueIndex) queueIndex -= 1;
          else if (from > s.queueIndex && to <= s.queueIndex) queueIndex += 1;
          return { ...s, queue, queueIndex };
        }),

      clearQueue: () => set({ queue: [], originalQueue: null, queueIndex: -1, currentTrack: null, state: 'idle' }),

      setSleepTimer: (minutes) =>
        set({ sleepTimerEndsAt: minutes == null ? null : Date.now() + minutes * 60_000 }),

      setState: (state) => set({ state }),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),

      advanceFromCrossfade: (index, track) => {
        useLibraryStore.getState().addRecent(track);
        set({
          queueIndex: index,
          currentTrack: track,
          state: 'playing',
          progress: 0,
          duration: track.duration || 0,
        });
      },
    }),
    {
      name: 'rem-player',
      partialize: (s) => ({
        volume: s.volume,
        muted: s.muted,
        repeat: s.repeat,
        shuffle: s.shuffle,
      }),
    }
  )
);
