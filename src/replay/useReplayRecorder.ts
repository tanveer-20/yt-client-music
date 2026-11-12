import { useEffect } from 'react';
import { usePlayerStore } from '@/state/player';
import { recordTick, resetSession } from './recorder';
import type { ReplayTrackMeta } from './types';

/**
 * Record listening while the player is active. Call once from AppShell.
 * Backward seeks and jumps larger than 30 seconds reset the current session.
 */
export function useReplayRecorder(): void {
  useEffect(() => {
    let lastProgress = 0;
    let lastTrackId: string | null = null;

    return usePlayerStore.subscribe((state) => {
      const track = state.currentTrack;
      if (!track) {
        lastTrackId = null;
        lastProgress = 0;
        resetSession();
        return;
      }

      if (track.id !== lastTrackId) {
        lastTrackId = track.id;
        lastProgress = 0;
        resetSession();
      }

      const progress = state.progress;
      const delta = progress - lastProgress;
      if (delta < 0 || delta > 30) resetSession();
      lastProgress = progress;

      if (state.state === 'playing' || (state.state === 'paused' && delta > 0)) {
        const meta: ReplayTrackMeta = {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          thumbnail: track.thumbnail,
          duration: track.duration,
        };
        void recordTick(meta, progress);
      }
    });
  }, []);
}
