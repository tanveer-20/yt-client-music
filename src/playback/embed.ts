/**
 * YouTube IFrame player — the no-extension fallback.
 *
 * googlevideo URLs must be minted from the listener's own IP, and YouTube's
 * player API refuses requests from Vercel/Render/Cloudflare datacenter ranges
 * with "Sign in to confirm you're not a bot". The IFrame player runs in the
 * listener's browser, so it is not subject to either restriction.
 *
 * Trade-offs versus direct playback: no Web Audio graph, no true crossfade,
 * and mobile browsers may pause the embed when the screen locks.
 */

type EmbedState = -1 | 0 | 1 | 2 | 3 | 5;

interface YouTubePlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): EmbedState;
  destroy(): void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayer;
  data: EmbedState | number;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (event: YouTubePlayerEvent) => void;
        onError: (event: YouTubePlayerEvent) => void;
      };
    }
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface EmbedHandlers {
  onStateChange: (state: EmbedState) => void;
  onError: (code: number) => void;
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

function loadIframeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      apiPromise = null;
      reject(new Error('YouTube IFrame API timed out'));
    }, 15000);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else {
        apiPromise = null;
        reject(new Error('YouTube IFrame API loaded without a player'));
      }
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      apiPromise = null;
      reject(new Error('YouTube IFrame API failed to load'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

export class YouTubeEmbed {
  private player: YouTubePlayer | null = null;
  private container: HTMLDivElement;
  private host: HTMLDivElement;
  private ready: Promise<YouTubePlayer>;
  private handlers: EmbedHandlers;
  private pendingVideoId: string | null = null;
  private pendingRate = 1;
  private destroyed = false;

  constructor(handlers: EmbedHandlers) {
    this.handlers = handlers;

    this.container = document.createElement('div');
    this.container.id = 'rem-embed-player';
    Object.assign(this.container.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '320px',
      height: '180px',
      opacity: '0.01',
      pointerEvents: 'none',
      zIndex: '-1',
      overflow: 'hidden',
    });

    this.host = document.createElement('div');
    this.host.id = 'rem-embed-player-host';
    this.container.appendChild(this.host);
    document.body.appendChild(this.container);

    this.ready = loadIframeApi().then(
      (YT) =>
        new Promise<YouTubePlayer>((resolve) => {
          this.player = new YT.Player(this.host, {
            width: '320',
            height: '180',
            playerVars: {
              autoplay: 0,
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
              onReady: () => resolve(this.player!),
              onStateChange: (event) => {
                if (this.destroyed) return;
                // Rates set before loadVideoById are ignored; apply the
                // pending rate once the new video actually starts.
                if (event.data === 1) this.applyPendingRate();
                this.handlers.onStateChange(event.data as EmbedState);
              },
              onError: (event) => {
                if (this.destroyed) return;
                this.handlers.onError(event.data);
              },
            },
          });
        })
    );

    // A rejected ready promise is surfaced to the caller of load(); avoid an
    // unhandled rejection when the script is blocked before any track loads.
    this.ready.catch(() => {});
  }

  async load(videoId: string, volume: number, playbackRate: number): Promise<void> {
    const player = await this.ready;
    if (this.destroyed) return;
    this.pendingVideoId = videoId;
    this.pendingRate = playbackRate;
    player.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100));
    player.loadVideoById(videoId);
  }

  play(): void {
    if (this.player && this.pendingVideoId) this.player.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  seek(seconds: number): void {
    this.player?.seekTo(seconds, true);
  }

  setVolume(volume: number): void {
    this.player?.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100));
  }

  setPlaybackRate(rate: number): void {
    this.pendingRate = rate;
    this.applyPendingRate();
  }

  private applyPendingRate(): void {
    try {
      this.player?.setPlaybackRate(this.pendingRate);
    } catch {
      /* unsupported rate */
    }
  }

  currentTime(): number {
    return this.player?.getCurrentTime() ?? 0;
  }

  duration(): number {
    return this.player?.getDuration() ?? 0;
  }

  playerState(): EmbedState | null {
    return this.player?.getPlayerState() ?? null;
  }

  destroy(): void {
    this.destroyed = true;
    try {
      this.player?.destroy();
    } catch {
      /* already gone */
    }
    this.player = null;
    this.container.remove();
  }
}
