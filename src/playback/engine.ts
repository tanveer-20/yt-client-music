import { Capacitor } from '@capacitor/core';
import type { Track } from '@/types';
import { streamUrl } from '@/config';
import { usePlayerStore } from '@/state/player';
import { useSettingsStore } from '@/state/settings';
import { fetchSuggestions } from '@/data/music/api';
import { createMediaMetadata } from './mediaSession';

type DeckId = 'a' | 'b';

interface CrossfadeState {
  from: DeckId;
  to: DeckId;
  startedAt: number;
  durationMs: number;
  nextIndex: number;
  nextTrack: Track;
}

const CROSSFADE_MIN_MS = 800;

/**
 * Rem PlaybackEngine — proxy deck.
 *
 * Two audio elements allow a true equal-power crossfade between tracks.
 * On desktop the decks run through a Web Audio graph; on native WebViews
 * they stay on the element volume path to keep background playback stable.
 */
export class PlaybackEngine {
  private deckA: HTMLAudioElement | null = null;
  private deckB: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gains: Record<DeckId, GainNode | null> = { a: null, b: null };
  private active: DeckId = 'a';
  private crossfade: CrossfadeState | null = null;
  private raf = 0;
  private loadToken = 0;
  private lastPositionReport = 0;
  private retries = new Map<string, number>();
  private autoplayPending = false;
  private cleanups: Array<() => void> = [];
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.deckA = (document.getElementById('rem-deck-a') as HTMLAudioElement) || this.createDeck('rem-deck-a');
    this.deckB = (document.getElementById('rem-deck-b') as HTMLAudioElement) || this.createDeck('rem-deck-b');

    for (const id of ['a', 'b'] as DeckId[]) {
      const el = this.deck(id);
      el.preload = 'auto';
      el.addEventListener('playing', () => {
        if (id !== this.active) return;
        usePlayerStore.getState().setState('playing');
      });
      el.addEventListener('waiting', () => {
        if (id !== this.active) return;
        if (usePlayerStore.getState().state === 'playing') usePlayerStore.getState().setState('loading');
      });
      el.addEventListener('loadedmetadata', () => {
        if (id !== this.active) return;
        if (Number.isFinite(el.duration)) usePlayerStore.getState().setDuration(el.duration);
      });
      el.addEventListener('ended', () => this.onEnded(id));
      el.addEventListener('error', () => this.onError(id));
      el.addEventListener('timeupdate', () => {
        if (id !== this.active || this.crossfade) return;
        usePlayerStore.getState().setProgress(el.currentTime);
        if (Number.isFinite(el.duration)) usePlayerStore.getState().setDuration(el.duration);
      });
    }

    this.bindStore();
    this.bindMediaSession();
    this.tick();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.deckA?.pause();
    this.deckB?.pause();
    this.ctx?.close().catch(() => {});
    this.initialized = false;
  }

  // ── Store wiring ─────────────────────────────────────────

  private bindStore(): void {
    const unsubscribe = usePlayerStore.subscribe((state, prev) => {
      if (state.playRequestId !== prev.playRequestId && state.currentTrack) {
        this.load(state.currentTrack);
      }

      if (state.state !== prev.state) {
        if (state.state === 'playing') this.resume();
        else if (state.state === 'paused' || state.state === 'idle') this.pause();
      }

      if (state.volume !== prev.volume || state.muted !== prev.muted) {
        this.applyVolume();
      }

      if (state.seekNonce !== prev.seekNonce) {
        this.applySeek(state.seekTarget);
      }

      if (state.playbackRate !== prev.playbackRate) {
        this.deck(this.active).playbackRate = state.playbackRate;
      }

      if (state.currentTrack?.id !== prev.currentTrack?.id) {
        this.updateMediaSession();
      }
    });
    this.cleanups.push(unsubscribe);
  }

  private bindMediaSession(): void {
    if (!('mediaSession' in navigator)) return;

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ['play', () => usePlayerStore.getState().play()],
      ['pause', () => usePlayerStore.getState().pause()],
      ['previoustrack', () => usePlayerStore.getState().previous()],
      ['nexttrack', () => usePlayerStore.getState().next()],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') usePlayerStore.getState().seek(details.seekTime);
        },
      ],
      [
        'seekbackward',
        (details) => {
          const s = usePlayerStore.getState();
          s.seek(Math.max(0, s.progress - (details.seekOffset || 10)));
        },
      ],
      [
        'seekforward',
        (details) => {
          const s = usePlayerStore.getState();
          s.seek(Math.min(s.duration || Infinity, s.progress + (details.seekOffset || 10)));
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* unsupported action */
      }
    }
  }

  private updateMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const track = usePlayerStore.getState().currentTrack;
    try {
      navigator.mediaSession.metadata = track ? createMediaMetadata(track) : null;
    } catch {
      /* noop */
    }
  }

  // ── Load / transport ─────────────────────────────────────

  private load(track: Track): void {
    this.cancelCrossfade();
    const el = this.deck(this.active);
    const other = this.deck(this.otherDeck(this.active));
    other.pause();
    other.removeAttribute('src');
    other.load();
    this.setLevel(this.otherDeck(this.active), 0);

    this.ensureGraph();
    void this.ctx?.resume().catch(() => {});

    const token = ++this.loadToken;
    const store = usePlayerStore.getState();

    el.pause();
    el.src = streamUrl(track.id);
    el.load();
    el.playbackRate = store.playbackRate;
    this.setLevel(this.active, this.effectiveVolume());

    el.play()
      .then(() => {
        if (token !== this.loadToken) return;
        usePlayerStore.getState().setState('playing');
        usePlayerStore.getState().setProgress(0);
      })
      .catch((err: unknown) => {
        if (token !== this.loadToken) return;
        console.warn('Playback was blocked or failed:', err);
        usePlayerStore.getState().setState('paused');
      });
  }

  private resume(): void {
    const track = usePlayerStore.getState().currentTrack;
    if (!track) return;
    this.ensureGraph();
    void this.ctx?.resume().catch(() => {});

    const el = this.deck(this.active);
    if (!el.src) {
      this.load(track);
      return;
    }
    if (el.paused) {
      el.play().catch(() => usePlayerStore.getState().setState('paused'));
    }
  }

  private pause(): void {
    this.deck(this.active).pause();
    if (this.crossfade) {
      this.cancelCrossfade();
    }
  }

  private applySeek(target: number): void {
    this.cancelCrossfade();
    const el = this.deck(this.active);
    if (!Number.isFinite(target)) return;
    try {
      el.currentTime = target;
    } catch {
      /* metadata not ready */
    }
    usePlayerStore.getState().setProgress(target);
  }

  private applyVolume(): void {
    const level = this.effectiveVolume();
    if (this.crossfade) return;
    this.setLevel(this.active, level);
  }

  private effectiveVolume(): number {
    const { volume, muted } = usePlayerStore.getState();
    return muted ? 0 : volume;
  }

  // ── Crossfade ────────────────────────────────────────────

  private maybeStartCrossfade(): void {
    if (this.crossfade) return;
    const settings = useSettingsStore.getState();
    if (settings.crossfadeSec <= 0) return;

    const state = usePlayerStore.getState();
    if (state.state !== 'playing' || !state.queue.length) return;
    if (state.repeat === 'one') return;

    let nextIndex = state.queueIndex + 1;
    if (nextIndex >= state.queue.length) {
      if (state.repeat === 'all' && state.queue.length > 1) nextIndex = 0;
      else return;
    }
    if (nextIndex === state.queueIndex) return;

    const el = this.deck(this.active);
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    const remaining = el.duration - el.currentTime;
    if (remaining > settings.crossfadeSec) return;

    const nextTrack = state.queue[nextIndex];
    const from = this.active;
    const to = this.otherDeck(from);
    const idle = this.deck(to);

    this.ensureGraph();
    idle.pause();
    idle.src = streamUrl(nextTrack.id);
    idle.load();
    idle.playbackRate = state.playbackRate;
    this.setLevel(to, 0);

    const durationMs = Math.max(CROSSFADE_MIN_MS, settings.crossfadeSec * 1000);
    this.crossfade = {
      from,
      to,
      startedAt: performance.now(),
      durationMs,
      nextIndex,
      nextTrack,
    };

    idle.play().catch(() => {
      this.crossfade = null;
      this.setLevel(to, 0);
    });
  }

  private stepCrossfade(now: number): void {
    if (!this.crossfade) return;
    const { from, to, startedAt, durationMs } = this.crossfade;
    const progress = Math.min(1, (now - startedAt) / durationMs);
    const level = this.effectiveVolume();
    const out = Math.cos((progress * Math.PI) / 2);
    const inLevel = Math.sin((progress * Math.PI) / 2);

    this.setLevel(from, level * out);
    this.setLevel(to, level * inLevel);

    if (progress >= 1) this.finishCrossfade();
  }

  private finishCrossfade(): void {
    const cf = this.crossfade;
    if (!cf) return;
    this.crossfade = null;

    const oldDeck = this.deck(cf.from);
    oldDeck.pause();
    oldDeck.removeAttribute('src');
    oldDeck.load();
    this.setLevel(cf.from, 0);

    this.active = cf.to;
    this.setLevel(cf.to, this.effectiveVolume());
    usePlayerStore.getState().advanceFromCrossfade(cf.nextIndex, cf.nextTrack);
  }

  private cancelCrossfade(): void {
    const cf = this.crossfade;
    if (!cf) return;
    this.crossfade = null;
    const to = this.deck(cf.to);
    to.pause();
    to.removeAttribute('src');
    to.load();
    this.setLevel(cf.to, 0);
    this.setLevel(cf.from, this.effectiveVolume());
  }

  // ── Endings and errors ───────────────────────────────────

  private onEnded(id: DeckId): void {
    if (id !== this.active) return;
    if (this.crossfade) {
      this.finishCrossfade();
      return;
    }

    const state = usePlayerStore.getState();
    if (state.repeat === 'one') {
      const el = this.deck(id);
      el.currentTime = 0;
      el.play().catch(() => {});
      return;
    }

    const nextIndex = state.queueIndex + 1;
    if (nextIndex < state.queue.length || (state.repeat === 'all' && state.queue.length > 1)) {
      state.next(true);
      return;
    }

    if (useSettingsStore.getState().autoplaySimilar && !this.autoplayPending) {
      void this.extendWithSimilar();
      return;
    }

    state.setState('paused');
    state.setProgress(0);
  }

  private async extendWithSimilar(): Promise<void> {
    const state = usePlayerStore.getState();
    const track = state.currentTrack;
    if (!track) return;

    this.autoplayPending = true;
    try {
      const suggestions = await fetchSuggestions(track.id);
      const existing = new Set(state.queue.map((t) => t.id));
      const additions = suggestions.filter((t) => !existing.has(t.id)).slice(0, 10);
      if (!additions.length) {
        usePlayerStore.setState({ state: 'paused' });
        return;
      }
      usePlayerStore.setState((s) => ({ queue: [...s.queue, ...additions] }));
      usePlayerStore.getState().next(true);
    } catch {
      usePlayerStore.setState({ state: 'paused' });
    } finally {
      this.autoplayPending = false;
    }
  }

  private onError(id: DeckId): void {
    if (id !== this.active) {
      this.cancelCrossfade();
      return;
    }
    const state = usePlayerStore.getState();
    const track = state.currentTrack;
    if (!track) return;

    const attempts = this.retries.get(track.id) || 0;
    if (attempts >= 2) {
      this.retries.delete(track.id);
      state.setState('paused');
      return;
    }
    this.retries.set(track.id, attempts + 1);
    state.next(true);
  }

  // ── Animation loop ───────────────────────────────────────

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    this.stepCrossfade(now);

    const state = usePlayerStore.getState();
    const el = this.deck(this.active);

    if (state.sleepTimerEndsAt && Date.now() >= state.sleepTimerEndsAt) {
      state.setSleepTimer(null);
      state.pause();
    }

    if (!this.crossfade && state.state === 'playing') {
      if (Number.isFinite(el.duration)) state.setDuration(el.duration);
      if (!el.paused) state.setProgress(el.currentTime);
      this.maybeStartCrossfade();
    }

    if ('mediaSession' in navigator && state.state === 'playing' && now - this.lastPositionReport > 1000) {
      this.lastPositionReport = now;
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : state.duration;
      if (duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: el.playbackRate || 1,
            position: Math.min(el.currentTime, duration),
          });
        } catch {
          /* noop */
        }
      }
    }
  };

  // ── Helpers ──────────────────────────────────────────────

  private deck(id: DeckId): HTMLAudioElement {
    const el = id === 'a' ? this.deckA : this.deckB;
    if (!el) throw new Error('Playback deck missing');
    return el;
  }

  private otherDeck(id: DeckId): DeckId {
    return id === 'a' ? 'b' : 'a';
  }

  private createDeck(id: string): HTMLAudioElement {
    const el = document.createElement('audio');
    el.id = id;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    document.body.appendChild(el);
    return el;
  }

  private ensureGraph(): void {
    if (this.ctx || Capacitor.isNativePlatform()) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    try {
      this.ctx = new Ctx();
      for (const id of ['a', 'b'] as DeckId[]) {
        const el = this.deck(id);
        const source = this.ctx.createMediaElementSource(el);
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.ctx.destination);
        this.gains[id] = gain;
        el.volume = 1;
      }
    } catch (err) {
      console.warn('Web Audio graph unavailable, using element volume:', err);
      this.ctx = null;
    }
  }

  private setLevel(id: DeckId, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    const gain = this.gains[id];
    if (gain) gain.gain.value = clamped;
    else this.deck(id).volume = clamped;
  }
}

let singleton: PlaybackEngine | null = null;

export function getPlaybackEngine(): PlaybackEngine {
  if (!singleton) {
    singleton = new PlaybackEngine();
    singleton.init();
  }
  return singleton;
}
