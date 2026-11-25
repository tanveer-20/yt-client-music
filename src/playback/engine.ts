import type { Track } from '@/types';
import { usePlayerStore } from '@/state/player';
import { useSettingsStore } from '@/state/settings';
import { fetchSuggestions } from '@/data/music/api';
import { createMediaMetadata } from './mediaSession';
import {
  cachedDirectUrl,
  directMode,
  directUsesCors,
  invalidateDirectUrl,
  prefetchDirectUrl,
  probeDirectPlayback,
  resolvePlaybackUrl,
} from './source';
import { YouTubeEmbed } from './embed';
import { useAutomixStore, analyzeAudioUrl, planAutomixTransition, type AudioAnalysis } from './automix';

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
 * With the companion extension the decks run through a Web Audio graph; native
 * WebViews and the no-extension server path stay on the element volume path
 * because googlevideo does not expose CORS headers without the extension.
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
  private analyses = new Map<string, AudioAnalysis>();
  private analysisInFlight = new Map<string, Promise<void>>();
  private embed: YouTubeEmbed | null = null;
  private embedActive = false;
  private embedStartedAt = 0;
  private lastEmbedReport = 0;
  private embedFailures = 0;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Playback prefers the user's own IP (via the companion extension) over
    // the proxy; probe once so the first tap can go direct.
    void probeDirectPlayback();

    // The no-extension web path uses YouTube's IFrame player. Create it during
    // startup so the first tap can start playback inside the browser's user
    // activation window instead of waiting on a resolver round-trip.
    if (directMode() === 'server') this.ensureEmbed();

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
    this.embed?.destroy();
    this.embed = null;
    this.embedActive = false;
    this.ctx?.close().catch(() => {});
    this.initialized = false;
  }

  // ── Store wiring ─────────────────────────────────────────

  private bindStore(): void {
    const unsubscribe = usePlayerStore.subscribe((state, prev) => {
      if (state.playRequestId !== prev.playRequestId && state.currentTrack) {
        void this.load(state.currentTrack);
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
        if (this.embedActive) this.embed?.setPlaybackRate(state.playbackRate);
        else this.deck(this.active).playbackRate = state.playbackRate;
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

  private async load(track: Track): Promise<void> {
    this.cancelCrossfade();
    this.embedActive = false;
    this.embed?.pause();

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

    // Automix pre-analyses the current and next track so a transition plan is
    // ready before the crossfade window opens. The next track's stream URL is
    // resolved now too, because the crossfade needs it without waiting.
    this.scheduleAnalysis(track);
    const queuedNext = store.queue[store.queueIndex + 1];
    if (queuedNext) {
      this.scheduleAnalysis(queuedNext);
      prefetchDirectUrl(queuedNext.id);
    }

    el.pause();
    el.removeAttribute('src');
    el.load();
    el.playbackRate = store.playbackRate;
    this.setLevel(this.active, this.effectiveVolume());
    usePlayerStore.getState().setState('loading');

    // The no-extension web path cannot resolve most tracks from the cloud
    // (YouTube bot-checks datacenter IPs), and waiting for that 502 burns the
    // user-activation window the IFrame player needs to start. Start the
    // embed immediately and resolve the direct URL in the background for
    // later plays. A cached URL, the extension, native, and addon tracks all
    // stay on the direct path.
    if (!track.streamUrl && directMode() === 'server' && !cachedDirectUrl(track.id)) {
      prefetchDirectUrl(track.id);
      await this.startEmbed(track, token);
      return;
    }

    // Direct resolution is a network call. When YouTube refuses both the
    // extension and the datacenter resolver, hand playback to the IFrame
    // player, which resolves from the listener's own address.
    let src: string;
    try {
      src = await resolvePlaybackUrl(track);
    } catch (error) {
      if (token !== this.loadToken) return;
      console.warn(
        '[playback] Direct stream unavailable; using the YouTube player:',
        error instanceof Error ? error.message : error
      );
      await this.startEmbed(track, token);
      return;
    }
    if (token !== this.loadToken) return;

    // Without the extension, googlevideo sends no CORS headers, so the
    // element must stay in no-CORS mode. The extension path can keep
    // `anonymous` because the extension exposes the response headers.
    if (!directUsesCors()) el.removeAttribute('crossorigin');
    else el.crossOrigin = 'anonymous';
    el.src = src;
    el.load();

    // A pause during resolution must win over the pending autoplay.
    const current = usePlayerStore.getState();
    if (current.state !== 'playing' && current.state !== 'loading') return;

    el.play()
      .then(() => {
        if (token !== this.loadToken) return;
        this.retries.delete(track.id);
        usePlayerStore.getState().setState('playing');
        usePlayerStore.getState().setProgress(0);
      })
      .catch((err: unknown) => {
        if (token !== this.loadToken) return;
        console.warn('Playback was blocked or failed:', err);
        usePlayerStore.getState().setState('paused');
      });
  }

  // ── Embed fallback ───────────────────────────────────────

  private async startEmbed(track: Track, token: number): Promise<void> {
    this.cancelCrossfade();
    this.embedActive = true;
    this.lastEmbedReport = 0;

    for (const id of ['a', 'b'] as DeckId[]) {
      const el = this.deck(id);
      el.pause();
      el.removeAttribute('src');
      el.load();
      this.setLevel(id, 0);
    }

    const store = usePlayerStore.getState();
    store.setState('loading');
    store.setProgress(0);
    if (token !== this.loadToken) return;

    try {
      const embed = this.ensureEmbed();
      await embed.load(track.id, this.effectiveVolume(), store.playbackRate);
      if (token !== this.loadToken) {
        embed.pause();
        return;
      }

      const current = usePlayerStore.getState();
      if (current.state !== 'playing' && current.state !== 'loading') {
        embed.pause();
        return;
      }

      // Time the stalled-player guard from the actual play request, not from
      // the API script load.
      this.embedStartedAt = Date.now();
      embed.play();
      const duration = embed.duration();
      if (duration > 0) usePlayerStore.getState().setDuration(duration);
    } catch (error) {
      if (token !== this.loadToken) return;
      console.warn('[playback] YouTube player failed:', error);
      this.embedActive = false;
      // The API script may have failed to load; rebuild the player on the
      // next attempt rather than keeping a permanently rejected instance.
      this.embed?.destroy();
      this.embed = null;
      usePlayerStore.getState().setState('paused');
    }
  }

  private ensureEmbed(): YouTubeEmbed {
    if (!this.embed) {
      this.embed = new YouTubeEmbed({
        onStateChange: (state) => this.onEmbedState(state),
        onError: (code) => this.onEmbedError(code),
      });
    }
    return this.embed;
  }

  private onEmbedState(state: number): void {
    if (!this.embedActive) return;
    const store = usePlayerStore.getState();
    if (state === 1) {
      this.embedFailures = 0;
      store.setState('playing');
    } else if (state === 2) {
      if (store.state === 'playing') store.setState('paused');
    } else if (state === 3) {
      if (store.state === 'playing') store.setState('loading');
    } else if (state === 0) {
      this.handleEnded();
    }
  }

  private onEmbedError(code: number): void {
    if (!this.embedActive) return;
    console.warn(`[playback] YouTube player error ${code}`);
    this.embedFailures += 1;
    const store = usePlayerStore.getState();
    if (this.embedFailures >= 2) {
      store.setState('paused');
      return;
    }
    // 100/101/150 mean the video is missing or not embeddable; move on.
    if (code === 100 || code === 101 || code === 150) {
      store.next(true);
      return;
    }
    store.setState('paused');
  }

  private resume(): void {
    const track = usePlayerStore.getState().currentTrack;
    if (!track) return;
    if (this.embedActive) {
      this.embed?.play();
      return;
    }
    this.ensureGraph();
    void this.ctx?.resume().catch(() => {});

    const el = this.deck(this.active);
    if (!el.src) {
      void this.load(track);
      return;
    }
    if (el.paused) {
      el.play().catch(() => usePlayerStore.getState().setState('paused'));
    }
  }

  private pause(): void {
    this.deck(this.active).pause();
    if (this.embedActive) this.embed?.pause();
    if (this.crossfade) {
      this.cancelCrossfade();
    }
  }

  private applySeek(target: number): void {
    this.cancelCrossfade();
    if (!Number.isFinite(target)) return;
    if (this.embedActive) {
      this.embed?.seek(target);
      usePlayerStore.getState().setProgress(target);
      return;
    }
    const el = this.deck(this.active);
    try {
      el.currentTime = target;
    } catch {
      /* metadata not ready */
    }
    usePlayerStore.getState().setProgress(target);
  }

  private applyVolume(): void {
    const level = this.effectiveVolume();
    if (this.embedActive) {
      this.embed?.setVolume(level);
      return;
    }
    if (this.crossfade) return;
    this.setLevel(this.active, level);
  }

  private effectiveVolume(): number {
    const { volume, muted } = usePlayerStore.getState();
    return muted ? 0 : volume;
  }

  // ── Crossfade ────────────────────────────────────────────

  /** Fire-and-forget audio analysis used by Automix to plan transitions. */
  private scheduleAnalysis(track: Track): void {
    if (!useAutomixStore.getState().enabled) return;
    // Analysis fetches the googlevideo URL cross-origin and needs the
    // extension's CORS headers; without them it silently falls back to the
    // default plan, so skip the doomed request.
    if (directMode() === 'server') return;
    if (this.analyses.has(track.id) || this.analysisInFlight.has(track.id)) return;
    const pending = resolvePlaybackUrl(track)
      .then((url) => analyzeAudioUrl(url))
      .then((analysis) => {
        this.analyses.set(track.id, analysis);
      })
      .catch(() => {
        /* analysis is best-effort; planning falls back to defaults */
      })
      .finally(() => {
        this.analysisInFlight.delete(track.id);
      });
    this.analysisInFlight.set(track.id, pending);
  }

  private maybeStartCrossfade(): void {
    if (this.crossfade || this.embedActive) return;
    const settings = useSettingsStore.getState();

    const state = usePlayerStore.getState();
    if (state.state !== 'playing' || !state.queue.length) return;
    if (state.repeat === 'one') return;

    let nextIndex = state.queueIndex + 1;
    if (nextIndex >= state.queue.length) {
      if (state.repeat === 'all' && state.queue.length > 1) nextIndex = 0;
      else return;
    }
    if (nextIndex === state.queueIndex) return;

    const nextTrack = state.queue[nextIndex];

    // Automix plans each transition from the analysed audio; without it the
    // fixed crossfade slider decides the overlap.
    let sec = settings.crossfadeSec;
    if (useAutomixStore.getState().enabled) {
      const plan = planAutomixTransition(
        state.currentTrack ? this.analyses.get(state.currentTrack.id) : undefined,
        this.analyses.get(nextTrack.id),
        useAutomixStore.getState().transitionSec
      );
      if (plan.type === 'cut') return;
      sec = Math.max(1, plan.durationSec);
    }
    if (sec <= 0) return;

    const el = this.deck(this.active);
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    const remaining = el.duration - el.currentTime;
    if (remaining > sec) return;

    const from = this.active;
    const to = this.otherDeck(from);
    const idle = this.deck(to);

    this.ensureGraph();
    idle.pause();
    const nextSrc = cachedDirectUrl(nextTrack.id);
    if (!nextSrc) {
      // The direct URL is still resolving; keep playing and try again on the
      // next tick, or let onEnded load the track normally.
      prefetchDirectUrl(nextTrack.id);
      return;
    }
    if (!directUsesCors()) idle.removeAttribute('crossorigin');
    else idle.crossOrigin = 'anonymous';
    idle.src = nextSrc;
    idle.load();
    idle.playbackRate = state.playbackRate;
    this.setLevel(to, 0);

    const durationMs = Math.max(CROSSFADE_MIN_MS, sec * 1000);
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
    this.handleEnded();
  }

  private handleEnded(): void {
    const state = usePlayerStore.getState();
    if (state.repeat === 'one') {
      if (this.embedActive) {
        this.embed?.seek(0);
        this.embed?.play();
      } else {
        const el = this.deck(this.active);
        el.currentTime = 0;
        el.play().catch(() => {});
      }
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
    invalidateDirectUrl(track.id);
    if (attempts >= 2) {
      this.retries.delete(track.id);
      state.setState('paused');
      return;
    }
    this.retries.set(track.id, attempts + 1);
    if (attempts === 0) {
      // The URL may have expired or been minted for another address: resolve
      // again and retry the same track once.
      void this.load(track);
      return;
    }
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

    if (this.embedActive) {
      if (now - this.lastEmbedReport > 250) {
        this.lastEmbedReport = now;
        const duration = this.embed?.duration() ?? 0;
        if (duration > 0) state.setDuration(duration);
        if (state.state === 'playing') {
          const time = this.embed?.currentTime() ?? 0;
          if (time > 0) state.setProgress(time);
        }
        const playerState = this.embed?.playerState();
        if (
          state.state === 'loading' &&
          Date.now() - this.embedStartedAt > 15_000 &&
          playerState !== 1 &&
          playerState !== 3
        ) {
          // The embed never started; usually the video is not embeddable or
          // autoplay was blocked. Stop spinning and let the user press play.
          state.setState('paused');
        }
      }
    } else if (!this.crossfade && state.state === 'playing') {
      if (Number.isFinite(el.duration)) state.setDuration(el.duration);
      if (!el.paused) state.setProgress(el.currentTime);
      this.maybeStartCrossfade();
    }

    if ('mediaSession' in navigator && state.state === 'playing' && now - this.lastPositionReport > 1000) {
      this.lastPositionReport = now;
      const duration = this.embedActive
        ? this.embed?.duration() ?? 0
        : Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : state.duration;
      const position = this.embedActive ? this.embed?.currentTime() ?? 0 : el.currentTime;
      const rate = this.embedActive ? state.playbackRate : el.playbackRate || 1;
      if (duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: rate,
            position: Math.min(position, duration),
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
    document.body.appendChild(el);
    return el;
  }

  private ensureGraph(): void {
    if (this.ctx || !directUsesCors()) return;
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
