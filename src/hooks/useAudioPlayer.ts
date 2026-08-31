/**
 * useAudioPlayer — manages the HTML5 Audio element and syncs with the player store.
 * Also sets up MediaSession API for system-level media controls.
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { getStreamUrl } from '../utils/api';

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSeekingRef = useRef(false);

  const {
    currentTrack,
    state,
    volume,
    isMuted,
    setProgress,
    setDuration,
    setState,
    next,
    seek,
  } = usePlayerStore();

  // Create audio element once
  if (!audioRef.current) {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }

  const audio = audioRef.current;

  // ── Volume sync ──
  useEffect(() => {
    audio.volume = isMuted ? 0 : volume;
  }, [audio, volume, isMuted]);

  // ── Track change → load and play ──
  useEffect(() => {
    if (!currentTrack) {
      audio.pause();
      audio.src = '';
      return;
    }

    const src = getStreamUrl(currentTrack.id);
    audio.src = src;
    setState('loading');

    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => setState('playing'))
        .catch((err) => {
          // Auto-play blocked or other error
          if (err.name !== 'AbortError') {
            console.error('Playback error:', err);
            setState('error');
          }
        });
    }

    // Update MediaSession metadata
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork: currentTrack.thumbnail
          ? [
              { src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });
    }
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Play/Pause state sync ──
  useEffect(() => {
    if (state === 'playing' && audio.paused && audio.src) {
      audio.play().catch(() => {});
    } else if (state === 'paused' && !audio.paused) {
      audio.pause();
    }
  }, [state, audio]);

  // ── Seek sync ──
  const handleSeek = useCallback(
    (time: number) => {
      if (audio.src && isFinite(time)) {
        isSeekingRef.current = true;
        audio.currentTime = time;
        setProgress(time);
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 100);
      }
    },
    [audio, setProgress]
  );

  // Expose seek via store
  useEffect(() => {
    let prevProgress = usePlayerStore.getState().progress;
    const unsub = usePlayerStore.subscribe((state) => {
      const currentProgress = state.progress;
      // Only seek if the change is large (user-initiated seek, not timeupdate)
      if (Math.abs(currentProgress - prevProgress) > 1.5 && !isSeekingRef.current) {
        handleSeek(currentProgress);
      }
      prevProgress = currentProgress;
    });
    return unsub;
  }, [handleSeek]);

  // ── Audio event listeners ──
  useEffect(() => {
    const onTimeUpdate = () => {
      if (!isSeekingRef.current) {
        setProgress(audio.currentTime);
      }
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      next();
    };

    const onError = () => {
      console.error('Audio error:', audio.error);
      setState('error');
    };

    const onPlaying = () => {
      setState('playing');
    };

    const onWaiting = () => {
      setState('loading');
    };

    const onCanPlay = () => {
      const currentState = usePlayerStore.getState().state;
      if (currentState === 'loading') {
        setState('playing');
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [audio, setProgress, setDuration, setState, next]);

  // ── MediaSession handlers ──
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const store = usePlayerStore.getState;
    const { pause, resume } = usePlayerStore.getState();

    navigator.mediaSession.setActionHandler('play', () => resume());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      store().previous();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      store().next();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        handleSeek(details.seekTime);
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [handleSeek]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [audio]);

  return { audio, seek: handleSeek };
}
