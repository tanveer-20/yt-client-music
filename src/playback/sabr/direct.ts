import { getApiBase } from '@/config';

export interface DirectStreamInfo {
  videoId: string;
  url: string;
  format: string;
  contentType: string;
  loudnessDb?: number;
  headers: Record<string, string>;
  expiresAt: number;
}

export async function fetchDirectStream(videoId: string): Promise<DirectStreamInfo | null> {
  try {
    const res = await fetch(`${getApiBase()}/direct/${encodeURIComponent(videoId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as DirectStreamInfo;
    return payload.url ? payload : null;
  } catch {
    return null;
  }
}

/** Direct audio can be used when either the extension or a public server can reach Google. */
export async function canUseDirectAudio(extensionPresent: boolean): Promise<boolean> {
  return extensionPresent;
}

/** A small alternate audio source; not wired into the default proxy engine. */
export class DirectAudioSource {
  private element = document.createElement('audio');
  private loaded = false;

  constructor() {
    this.element.crossOrigin = 'anonymous';
    this.element.preload = 'auto';
  }

  load(url: string): void {
    this.loaded = true;
    this.element.src = url;
    this.element.load();
  }

  async play(): Promise<void> {
    if (!this.loaded) throw new Error('Direct audio source is not loaded.');
    await this.element.play();
  }

  pause(): void {
    this.element.pause();
  }

  seek(seconds: number): void {
    try {
      this.element.currentTime = seconds;
    } catch {
      /* metadata not ready */
    }
  }

  setVolume(value: number): void {
    this.element.volume = Math.max(0, Math.min(1, value));
  }

  get currentTime(): number {
    return this.element.currentTime;
  }

  get duration(): number {
    return Number.isFinite(this.element.duration) ? this.element.duration : 0;
  }

  destroy(): void {
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
  }
}
