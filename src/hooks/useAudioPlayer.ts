/**
 * useAudioPlayer — Hybrid High-Fidelity Audio Engine.
 * 1. Primary: Direct HTML5 <audio> streaming via backend (ultra-fast, 256kbps pure audio, zero iframe bugs).
 * 2. Fallback: YouTube Iframe audio engine for standalone APK operation when offline.
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { getStreamUrl, searchTracks } from '../utils/api';
import { audioDSP } from '../utils/audioEnhancer';
import type { Track } from '../types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const isYtReadyRef = useRef(false);
  const activeModeRef = useRef<'html5' | 'youtube'>('html5');
  const isSeekingRef = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryMapRef = useRef<Record<string, number>>({});

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

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  // ── Create and configure persistent HTML5 Audio Element with Studio DSP ──
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    const onPlay = () => {
      clearLoadingTimeout();
      audioDSP.init(audio);
      audioDSP.resume();
      setState('playing');
    };

    const onPause = () => {
      clearLoadingTimeout();
      if (usePlayerStore.getState().state !== 'loading') {
        setState('paused');
      }
    };

    const onWaiting = () => {
      setState('loading');
    };

    const onPlaying = () => {
      clearLoadingTimeout();
      setState('playing');
    };

    const onTimeUpdate = () => {
      if (!isSeekingRef.current && activeModeRef.current === 'html5') {
        setProgress(audio.currentTime);
      }
    };

    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      clearLoadingTimeout();
      usePlayerStore.getState().next();
    };

    const onError = () => {
      console.warn('HTML5 Audio encountered error, falling back to YouTube engine...');
      if (activeModeRef.current === 'html5') {
        // Switch to YouTube Iframe Player
        playViaYouTube(usePlayerStore.getState().currentTrack);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [clearLoadingTimeout, setDuration, setProgress, setState]);

  // ── YouTube IFrame Engine (Fallback) ──
  const playViaYouTube = useCallback((track: Track | null) => {
    if (!track) return;
    activeModeRef.current = 'youtube';

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    if (ytPlayerRef.current && isYtReadyRef.current) {
      try {
        ytPlayerRef.current.loadVideoById({
          videoId: track.id,
          startSeconds: 0,
          suggestedQuality: 'small',
        });
      } catch {
        setState('error');
      }
    }
  }, [setState]);

  // ── Auto-Fallback: Find alternative playable version of song ──
  const tryAlternativeTrack = useCallback(
    async (failedTrack: Track) => {
      const attempts = retryMapRef.current[failedTrack.id] || 0;
      if (attempts >= 2) {
        usePlayerStore.getState().next();
        return;
      }
      retryMapRef.current[failedTrack.id] = attempts + 1;

      try {
        const query = `${failedTrack.title} ${failedTrack.artist} audio`;
        const candidates = await searchTracks(query, 5);
        const alternative = candidates.find((t) => t.id !== failedTrack.id);

        if (alternative) {
          console.log(`Found alternative audio stream (${alternative.id}) for ${failedTrack.title}`);
          if (activeModeRef.current === 'html5' && audioRef.current) {
            audioRef.current.src = getStreamUrl(alternative.id);
            audioRef.current.play().catch(() => playViaYouTube(alternative));
          } else {
            playViaYouTube(alternative);
          }
          return;
        }
      } catch (err) {
        console.error('Alternative resolution failed:', err);
      }

      usePlayerStore.getState().next();
    },
    [playViaYouTube]
  );

  // ── Initialize YouTube Player in background ──
  useEffect(() => {
    const initYT = () => {
      if (ytPlayerRef.current) return;

      let targetEl = document.getElementById('youtube-audio-player');
      if (!targetEl) {
        targetEl = document.createElement('div');
        targetEl.id = 'youtube-audio-player';
        targetEl.style.position = 'fixed';
        targetEl.style.bottom = '0';
        targetEl.style.right = '0';
        targetEl.style.width = '1px';
        targetEl.style.height = '1px';
        targetEl.style.opacity = '0.001';
        targetEl.style.pointerEvents = 'none';
        targetEl.style.zIndex = '-9999';
        document.body.appendChild(targetEl);
      }

      try {
        ytPlayerRef.current = new window.YT.Player('youtube-audio-player', {
          height: '1',
          width: '1',
          videoId: '',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            modestbranding: 1,
          },
          events: {
            onReady: (event: any) => {
              isYtReadyRef.current = true;
              event.target.setVolume(isMuted ? 0 : Math.round(volume * 100));
            },
            onStateChange: (event: any) => {
              if (activeModeRef.current !== 'youtube') return;
              const YTState = window.YT.PlayerState;
              if (event.data === YTState.PLAYING) {
                clearLoadingTimeout();
                setState('playing');
                const dur = event.target.getDuration();
                if (dur && isFinite(dur)) setDuration(dur);
              } else if (event.data === YTState.PAUSED) {
                clearLoadingTimeout();
                setState('paused');
              } else if (event.data === YTState.BUFFERING) {
                setState('loading');
              } else if (event.data === YTState.ENDED) {
                clearLoadingTimeout();
                usePlayerStore.getState().next();
              }
            },
            onError: (event: any) => {
              if (activeModeRef.current !== 'youtube') return;
              clearLoadingTimeout();
              const curr = usePlayerStore.getState().currentTrack;
              if (curr) tryAlternativeTrack(curr);
              else usePlayerStore.getState().next();
            },
          },
        });
      } catch {}
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initYT;
    }
  }, [clearLoadingTimeout, isMuted, setDuration, setState, tryAlternativeTrack, volume]);

  // ── Track change → load and play ──
  useEffect(() => {
    if (!currentTrack) {
      clearLoadingTimeout();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (ytPlayerRef.current && isYtReadyRef.current) {
        try {
          ytPlayerRef.current.stopVideo();
        } catch {}
      }
      return;
    }

    setState('loading');
    clearLoadingTimeout();

    // 8-second watchdog: if track gets stuck buffering, auto-recover
    loadingTimeoutRef.current = setTimeout(() => {
      if (usePlayerStore.getState().state === 'loading') {
        console.warn('Loading timeout reached, resolving alternative...');
        tryAlternativeTrack(currentTrack);
      }
    }, 8000);

    // Primary: Load HTML5 Audio Stream
    activeModeRef.current = 'html5';
    if (audioRef.current) {
      const streamUrl = getStreamUrl(currentTrack.id);
      audioRef.current.src = streamUrl;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current
        .play()
        .then(() => {
          clearLoadingTimeout();
          setState('playing');
        })
        .catch((err) => {
          console.warn('HTML5 play promise rejected, switching to YouTube engine:', err.message);
          playViaYouTube(currentTrack);
        });
    }

    // Update MediaSession
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork: currentTrack.thumbnail
          ? [{ src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });
    }
  }, [currentTrack?.id, clearLoadingTimeout, isMuted, playViaYouTube, setState, tryAlternativeTrack, volume]);

  // ── Play / Pause state sync ──
  useEffect(() => {
    if (activeModeRef.current === 'html5' && audioRef.current) {
      if (state === 'playing') {
        audioRef.current.play().catch(() => {});
      } else if (state === 'paused') {
        audioRef.current.pause();
      }
    } else if (activeModeRef.current === 'youtube' && ytPlayerRef.current && isYtReadyRef.current) {
      try {
        if (state === 'playing') ytPlayerRef.current.playVideo();
        else if (state === 'paused') ytPlayerRef.current.pauseVideo();
      } catch {}
    }
  }, [state]);

  // ── Volume sync ──
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;
      audioDSP.setVolume(isMuted ? 0 : volume);
    }
    if (ytPlayerRef.current && isYtReadyRef.current) {
      try {
        if (isMuted) ytPlayerRef.current.mute();
        else {
          ytPlayerRef.current.unMute();
          ytPlayerRef.current.setVolume(Math.round(volume * 100));
        }
      } catch {}
    }
  }, [volume, isMuted]);

  // ── Seek sync ──
  const handleSeek = useCallback(
    (time: number) => {
      if (!isFinite(time)) return;
      isSeekingRef.current = true;

      if (activeModeRef.current === 'html5' && audioRef.current) {
        audioRef.current.currentTime = time;
        setProgress(time);
      } else if (activeModeRef.current === 'youtube' && ytPlayerRef.current && isYtReadyRef.current) {
        try {
          ytPlayerRef.current.seekTo(time, true);
          setProgress(time);
        } catch {}
      }

      setTimeout(() => {
        isSeekingRef.current = false;
      }, 350);
    },
    [setProgress]
  );

  // Store progress subscription for seek updates
  useEffect(() => {
    let prevProgress = usePlayerStore.getState().progress;
    const unsub = usePlayerStore.subscribe((currState) => {
      const currentProgress = currState.progress;
      if (Math.abs(currentProgress - prevProgress) > 1.5 && !isSeekingRef.current) {
        handleSeek(currentProgress);
      }
      prevProgress = currentProgress;
    });
    return unsub;
  }, [handleSeek]);

  // ── YouTube Progress Ticker (only when in YouTube mode) ──
  useEffect(() => {
    const ticker = setInterval(() => {
      if (
        activeModeRef.current === 'youtube' &&
        ytPlayerRef.current &&
        isYtReadyRef.current &&
        !isSeekingRef.current &&
        usePlayerStore.getState().state === 'playing'
      ) {
        try {
          const curr = ytPlayerRef.current.getCurrentTime();
          const dur = ytPlayerRef.current.getDuration();
          if (typeof curr === 'number' && isFinite(curr)) setProgress(curr);
          if (typeof dur === 'number' && isFinite(dur) && dur > 0) setDuration(dur);
        } catch {}
      }
    }, 250);

    return () => clearInterval(ticker);
  }, [setProgress, setDuration]);

  // ── MediaSession Handlers ──
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const store = usePlayerStore.getState;
    const { pause, resume } = usePlayerStore.getState();

    navigator.mediaSession.setActionHandler('play', () => resume());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => store().previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => store().next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) handleSeek(details.seekTime);
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [handleSeek]);

  return { seek: handleSeek };
}
