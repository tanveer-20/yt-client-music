/**
 * useAudioPlayer — Hybrid High-Fidelity Audio Engine.
 * 1. Primary: Direct HTML5 <audio> streaming via backend (ultra-fast, 256kbps pure audio, zero iframe bugs).
 * 2. Fallback: YouTube Iframe audio engine for standalone APK operation when offline.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { usePlayerStore, appendHistory } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getStreamUrl, searchTracks, getSuggestions } from '../utils/api';
import { resolveStream } from '../utils/streamResolver';
import { audioDSP } from '../utils/audioEnhancer';
import type { Track } from '../types';

const NativeAudio = registerPlugin<any>('NativeAudio');

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
    __ytIframeReady?: boolean;
    __initYT?: (() => void) | undefined;
  }
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const isYtReadyRef = useRef(false);
  const pendingTrackRef = useRef<Track | null>(null);
  const activeModeRef = useRef<'html5' | 'youtube' | 'native'>(
    Capacitor.isNativePlatform() ? 'native' : 'youtube'
  );
  const isSeekingRef = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryMapRef = useRef<Record<string, number>>({});
  const loadedPlaylistIdsRef = useRef<string[]>([]);
  const isInternalTransitionRef = useRef(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const hasPrefetchedRef = useRef<string | null>(null);

  const {
    currentTrack,
    state,
    volume,
    isMuted,
    playRequestId,
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

  // ── Native Android Audio Listener (Bit-Perfect Hardware Offload) ──
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let progressTimer: any = null;

    const listenerPromise = NativeAudio.addListener('stateChange', (data: any) => {
      if (data.state === 'playing') {
        clearLoadingTimeout();
        setState('playing');
        if (data.duration && isFinite(data.duration)) {
          setDuration(data.duration);
        }
      } else if (data.state === 'paused') {
        clearLoadingTimeout();
        setState('paused');
      } else if (data.state === 'ended') {
        clearLoadingTimeout();
        usePlayerStore.getState().next();
      } else if (data.state === 'error') {
        clearLoadingTimeout();
        const curr = usePlayerStore.getState().currentTrack;
        if (curr) tryAlternativeTrack(curr);
      }
    });

    const actionListenerPromise = NativeAudio.addListener('mediaAction', (data: any) => {
      if (data.action === 'next') {
        usePlayerStore.getState().next();
      } else if (data.action === 'previous') {
        usePlayerStore.getState().previous();
      }
    });

    progressTimer = setInterval(async () => {
      if (usePlayerStore.getState().state === 'playing' && !isSeekingRef.current) {
        try {
          const res = await NativeAudio.getProgress();
          if (res && typeof res.currentTime === 'number') {
            setProgress(res.currentTime);
            if (res.duration && isFinite(res.duration) && res.duration > 0) {
              setDuration(res.duration);
            }
          }
        } catch {}
      }
    }, 400);

    return () => {
      listenerPromise.then((handle: any) => handle && handle.remove());
      actionListenerPromise.then((handle: any) => handle && handle.remove());
      if (progressTimer) clearInterval(progressTimer);
    };
  }, [clearLoadingTimeout, setDuration, setProgress, setState]);

  // ── Create and configure persistent HTML5 Audio Element with Studio DSP (Web) ──
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

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

  // ── YouTube IFrame Engine (Autonomous Continuous Streaming) ──
  const playViaYouTube = useCallback(
    (track: Track | null) => {
      if (!track) return;
      activeModeRef.current = 'youtube';

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      const player = ytPlayerRef.current;
      if (!player || !isYtReadyRef.current) {
        pendingTrackRef.current = track;
        return;
      }

      const { volume: curVol, isMuted: curMuted, queue, queueIndex } = usePlayerStore.getState();
      try {
        if (curMuted) {
          player.mute();
        } else {
          player.unMute();
          player.setVolume(Math.round(curVol * 100));
        }
      } catch {}

      const queueIds = queue.map((t) => t.id);
      const targetIdx =
        queueIndex >= 0 && queue[queueIndex]?.id === track.id
          ? queueIndex
          : queue.findIndex((t) => t.id === track.id);
      const validIdx = targetIdx >= 0 ? targetIdx : 0;

      // Check if the exact same video is already loaded and just needs to replay
      if (currentVideoIdRef.current === track.id) {
        try {
          player.seekTo(0, true);
          player.playVideo();
          return;
        } catch {}
      }

      // Check if YouTube player already has this exact playlist loaded
      const isSamePlaylist =
        loadedPlaylistIdsRef.current.length > 0 &&
        loadedPlaylistIdsRef.current.length === queueIds.length &&
        loadedPlaylistIdsRef.current.every((id, idx) => id === queueIds[idx]);

      if (isSamePlaylist && typeof player.playVideoAt === 'function') {
        try {
          currentVideoIdRef.current = track.id;
          player.playVideoAt(validIdx);
          return;
        } catch (e) {
          console.warn('playVideoAt failed, falling back to loadPlaylist:', e);
        }
      }

      // If queue has multiple items, load the entire queue as YouTube native playlist!
      if (queueIds.length > 1 && typeof player.loadPlaylist === 'function') {
        loadedPlaylistIdsRef.current = queueIds;
        currentVideoIdRef.current = track.id;
        try {
          player.loadPlaylist(queueIds, validIdx, 0);
        } catch (err) {
          console.warn('loadPlaylist failed:', err);
          try {
            player.loadVideoById({ videoId: track.id, startSeconds: 0 });
          } catch {}
        }
      } else {
        // Single track
        loadedPlaylistIdsRef.current = [track.id];
        currentVideoIdRef.current = track.id;
        try {
          if (typeof player.loadPlaylist === 'function') {
            player.loadPlaylist([track.id], 0, 0);
          } else {
            player.loadVideoById({ videoId: track.id, startSeconds: 0 });
          }
        } catch (err) {
          console.warn('Playback load failed:', err);
          setState('error');
        }
      }
    },
    [setState]
  );

  // ── Auto-resolve alternative audio stream if restricted ──
  const tryAlternativeTrack = useCallback(
    async (failedTrack: Track) => {
      const attempts = retryMapRef.current[failedTrack.id] || 0;
      if (attempts >= 2) {
        console.warn(`Giving up on track ${failedTrack.title} after 2 attempts.`);
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
          const altStreamUrl = getStreamUrl(alternative.id);
          if (Capacitor.isNativePlatform()) {
            NativeAudio.play({
              url: altStreamUrl,
              title: alternative.title || 'Unknown Title',
              artist: alternative.artist || 'Unknown Artist',
              artworkUrl: alternative.thumbnail || '',
              loudnessDb: (alternative as any).loudnessDb ?? 0,
            }).catch(() => playViaYouTube(alternative));
          } else if (activeModeRef.current === 'html5' && audioRef.current) {
            audioRef.current.src = altStreamUrl;
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
      if (ytPlayerRef.current || !window.YT || !window.YT.Player) return;

      let targetEl = document.getElementById('youtube-audio-player');
      if (!targetEl) {
        const container = document.createElement('div');
        container.id = 'youtube-audio-container';
        container.style.position = 'fixed';
        container.style.bottom = '0';
        container.style.right = '0';
        container.style.width = '200px';
        container.style.height = '200px';
        container.style.opacity = '0.001';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '-9999';

        targetEl = document.createElement('div');
        targetEl.id = 'youtube-audio-player';
        container.appendChild(targetEl);
        document.body.appendChild(container);
      }

      // Ensure iframe permissions policy: allow="autoplay; encrypted-media; picture-in-picture"
      const containerEl = document.getElementById('youtube-audio-container');
      if (containerEl) {
        const ensureIframePerms = () => {
          const iframes = containerEl.querySelectorAll('iframe');
          iframes.forEach((iframe) => {
            const curAllow = iframe.getAttribute('allow') || '';
            if (!curAllow.includes('autoplay')) {
              iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            }
          });
        };
        ensureIframePerms();
        const obs = new MutationObserver(ensureIframePerms);
        obs.observe(containerEl, { childList: true, subtree: true });
      }

      try {
        ytPlayerRef.current = new window.YT.Player('youtube-audio-player', {
          height: '200',
          width: '200',
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
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              isYtReadyRef.current = true;
              const iframe = event.target.getIframe?.();
              if (iframe) {
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
              }
              const { volume: curVol, isMuted: curMuted } = usePlayerStore.getState();
              if (curMuted) {
                event.target.mute();
              } else {
                event.target.unMute();
                event.target.setVolume(Math.round(curVol * 100));
              }

              // Play immediately if a track was requested while player was initializing
              if (pendingTrackRef.current) {
                const track = pendingTrackRef.current;
                pendingTrackRef.current = null;
                playViaYouTube(track);
              }
            },
            onStateChange: (event: any) => {
              if (activeModeRef.current !== 'youtube') return;
              const YTState = window.YT.PlayerState;

              if (event.data === YTState.PLAYING) {
                clearLoadingTimeout();
                setState('playing');
                const dur = event.target.getDuration();
                if (dur && isFinite(dur)) setDuration(dur);

                // Sync volume
                const { volume: curVol, isMuted: curMuted } = usePlayerStore.getState();
                try {
                  if (!curMuted && event.target.isMuted()) {
                    event.target.unMute();
                    event.target.setVolume(Math.round(curVol * 100));
                  }
                } catch {}

                // ── Check if YouTube advanced to another track in its playlist ──
                const currentPlIdx =
                  typeof event.target.getPlaylistIndex === 'function'
                    ? event.target.getPlaylistIndex()
                    : -1;
                const storeState = usePlayerStore.getState();
                const currentQueue = storeState.queue;
                const storeQueueIndex = storeState.queueIndex;

                if (
                  currentPlIdx >= 0 &&
                  currentPlIdx < currentQueue.length &&
                  currentPlIdx !== storeQueueIndex
                ) {
                  const nextTrack = currentQueue[currentPlIdx];
                  if (nextTrack) {
                    currentVideoIdRef.current = nextTrack.id;
                    isInternalTransitionRef.current = true;
                    usePlayerStore.setState((s) => ({
                      queueIndex: currentPlIdx,
                      currentTrack: nextTrack,
                      history: appendHistory(s.history, nextTrack),
                      state: 'playing',
                      progress: 0,
                    }));
                    setTimeout(() => {
                      isInternalTransitionRef.current = false;
                    }, 200);
                  }
                }
              } else if (event.data === YTState.PAUSED) {
                clearLoadingTimeout();
                if (!isInternalTransitionRef.current) {
                  const curState = usePlayerStore.getState().state;
                  if (curState === 'loading') {
                    // Autoplay policy edge case: nudge play once
                    setTimeout(() => {
                      if (usePlayerStore.getState().state === 'loading' && ytPlayerRef.current) {
                        try {
                          ytPlayerRef.current.playVideo();
                        } catch {}
                      }
                    }, 50);
                  } else {
                    setState('paused');
                  }
                }
              } else if (event.data === YTState.BUFFERING) {
                if (usePlayerStore.getState().state !== 'playing') {
                  setState('loading');
                }
              } else if (event.data === YTState.CUED) {
                try {
                  event.target.playVideo();
                } catch {}
              } else if (event.data === YTState.ENDED) {
                clearLoadingTimeout();

                const currentPlIdx =
                  typeof event.target.getPlaylistIndex === 'function'
                    ? event.target.getPlaylistIndex()
                    : -1;
                const plLength =
                  typeof event.target.getPlaylist === 'function'
                    ? event.target.getPlaylist()?.length || 0
                    : 0;

                const repeatMode = usePlayerStore.getState().repeatMode;
                if (repeatMode === 'one') {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                  } catch {}
                  return;
                }

                // If this is an intermediate track in a multi-track playlist,
                // YouTube's native playlist engine will automatically transition to the next track!
                // Do NOT call next() here, as it would interrupt YouTube's native transition!
                if (currentPlIdx >= 0 && plLength > 1 && currentPlIdx < plLength - 1) {
                  return;
                }

                // Reached the end of playlist or single track -> advance via store
                setTimeout(() => {
                  usePlayerStore.getState().next();
                }, 80);
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
      } catch (err) {
        console.error('Failed to init YouTube IFrame Player:', err);
      }
    };

    if (window.__ytIframeReady || (window.YT && window.YT.Player)) {
      initYT();
    } else {
      window.__initYT = initYT;
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        initYT();
      };
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const pollTimer = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(pollTimer);
          initYT();
        }
      }, 100);
      setTimeout(() => clearInterval(pollTimer), 5000);
    }
  }, [clearLoadingTimeout, setDuration, setState, tryAlternativeTrack]);

  // ── Track change → load and play ──
  useEffect(() => {
    if (!currentTrack) {
      clearLoadingTimeout();
      if (Capacitor.isNativePlatform()) {
        NativeAudio.pause().catch(() => {});
      }
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

    // If this track change was an internal YouTube playlist transition,
    // YouTube is ALREADY playing it! Do NOT reload or interrupt!
    if (isInternalTransitionRef.current) {
      clearLoadingTimeout();
      currentVideoIdRef.current = currentTrack.id;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          artwork: currentTrack.thumbnail
            ? [{ src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        });
      }
      return;
    }

    setState('loading');
    clearLoadingTimeout();

    // 6-second watchdog: if track gets stuck buffering, auto-nudge playback
    loadingTimeoutRef.current = setTimeout(() => {
      if (usePlayerStore.getState().state === 'loading') {
        console.warn('Playback watchdog: track still buffering, nudging playVideo...');
        if (activeModeRef.current === 'youtube' && ytPlayerRef.current) {
          try {
            ytPlayerRef.current.playVideo();
          } catch {}
        } else {
          tryAlternativeTrack(currentTrack);
        }
      }
    }, 6000);

    resolveStream(currentTrack.id)
      .then(({ url, engine }) => {
        if (engine === 'youtube' || !url) {
          playViaYouTube(currentTrack);
          return;
        }

        // Primary 1: Native Android Media3 ExoPlayer + MBDRC Studio Engine
        if (Capacitor.isNativePlatform() || engine === 'native') {
          activeModeRef.current = 'native';
          NativeAudio.play({
            url,
            title: currentTrack.title || 'Unknown Title',
            artist: currentTrack.artist || 'Unknown Artist',
            artworkUrl: currentTrack.thumbnail || '',
            loudnessDb: (currentTrack as any).loudnessDb ?? 0,
          })
            .then(() => {
              const { volume: curVol, isMuted: curMuted } = usePlayerStore.getState();
              NativeAudio.setVolume({ volume: curMuted ? 0 : curVol }).catch(() => {});
            })
            .catch((err: any) => {
              console.warn('NativeAudio play failed, falling back to YouTube engine:', err);
              playViaYouTube(currentTrack);
            });
        }
        // Primary 2: Web Browser Studio DSP Engine
        else if (audioRef.current) {
          activeModeRef.current = 'html5';
          audioRef.current.src = url;
          const { volume: curVol, isMuted: curMuted } = usePlayerStore.getState();
          audioRef.current.volume = curMuted ? 0 : curVol;
          audioRef.current.muted = curMuted;
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
      })
      .catch(() => {
        clearLoadingTimeout();
        playViaYouTube(currentTrack);
      });

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
  }, [currentTrack?.id, playRequestId, clearLoadingTimeout, playViaYouTube, setState, tryAlternativeTrack]);

  // ── Play / Pause state sync ──
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      if (state === 'playing') {
        NativeAudio.resume().catch(() => {});
      } else if (state === 'paused') {
        NativeAudio.pause().catch(() => {});
      }
      return;
    }

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
    if (Capacitor.isNativePlatform()) {
      NativeAudio.setVolume({ volume: isMuted ? 0 : volume }).catch(() => {});
      return;
    }

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

      if (Capacitor.isNativePlatform()) {
        NativeAudio.seek({ position: time }).catch(() => {});
        setProgress(time);
      } else if (activeModeRef.current === 'html5' && audioRef.current) {
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

          // Pre-fetch suggestions when 20 seconds remain on the last track in queue
          const store = usePlayerStore.getState();
          const autoPlay = useSettingsStore.getState().autoPlaySimilar;
          if (
            autoPlay &&
            store.currentTrack &&
            store.queue.length > 0 &&
            store.queueIndex === store.queue.length - 1 &&
            typeof dur === 'number' &&
            dur > 0 &&
            typeof curr === 'number' &&
            dur - curr < 20 &&
            hasPrefetchedRef.current !== store.currentTrack.id
          ) {
            hasPrefetchedRef.current = store.currentTrack.id;
            getSuggestions(store.currentTrack.id)
              .then((suggestions) => {
                if (suggestions && suggestions.length > 0) {
                  const latest = usePlayerStore.getState();
                  if (latest.queueIndex === latest.queue.length - 1) {
                    const existingIds = new Set(latest.queue.map((t) => t.id));
                    const newUnique = suggestions.filter((s) => !existingIds.has(s.id));
                    if (newUnique.length > 0) {
                      usePlayerStore.setState((s) => ({
                        queue: [...s.queue, ...newUnique],
                        originalQueue: [...s.originalQueue, ...newUnique],
                      }));
                    }
                  }
                }
              })
              .catch(() => {});
          }
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
