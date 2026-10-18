import type { Track } from '../types';

export interface MediaImage {
  src: string;
  sizes?: string;
  type?: string;
}


/**
 * Strips distracting promotional and release noise from YouTube video titles
 * so the Media Notification / Lock Screen displays clean, legible song titles.
 *
 * Example:
 * "Coldplay - Yellow (Official Video)" -> "Yellow"
 * "Queen – Bohemian Rhapsody (Official Video Remastered)" -> "Bohemian Rhapsody"
 */
export function cleanTitle(title?: string, artist?: string): string {
  if (!title) return 'Unknown Title';
  let t = title.trim();

  // Strip common bracketed clutter: (Official Music Video), [Official Audio], etc.
  const noiseRegex =
    /\s*[\(\[]\s*(?:official\s+(?:music\s+)?video|official\s+audio|official\s+(?:lyric\s+video|visualizer)|lyric\s+video|lyrics?|visualizer|official\s+visualizer|audio|full\s+song|remastered(?:\s+\d{4})?|4k(?:\s*60fps)?|hd)(?:[\s/|-]*(?:remastered|\d{4}|4k|hd|version|edit|audio|video|explicit|clean))*\s*[\)\]]/gi;
  t = t.replace(noiseRegex, '');

  // If the title starts with the artist name, strip it so it doesn't duplicate:
  // e.g. "Coldplay - Yellow" with artist "Coldplay" -> "Yellow"
  if (artist) {
    const cleanArt = cleanArtist(artist);
    const escapedArtist = cleanArt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const artistPrefix = new RegExp('^' + escapedArtist + '\\s*[-–—:]\\s*', 'i');
    t = t.replace(artistPrefix, '');
  }

  // Remove surrounding quotes e.g. "Song Title" -> Song Title
  t = t.replace(/^["'\s]+|["'\s]+$/g, '');

  // Remove trailing dangling dashes or separators
  t = t.replace(/\s*[-–—:]\s*$/, '');

  return t.trim() || title.trim();
}

/**
 * Strips YouTube auto-generated channel suffixes like "- Topic" or "VEVO".
 */
export function cleanArtist(artist?: string): string {
  if (!artist) return 'Unknown Artist';
  let a = artist.trim();
  a = a.replace(/\s*-\s*Topic$/i, '');
  a = a.replace(/\s*VEVO$/i, '');
  return a.trim() || 'Unknown Artist';
}

/**
 * Generates an array of crisp, multi-resolution artwork representations
 * suitable for Android lock screens, notification banners, and status bar icons.
 *
 * Avoids the Android SystemUI letterboxing / stretching bug caused by declaring
 * 4:3 widescreen video thumbnails as 512x512 squares.
 */
export function getOptimizedArtwork(thumbnailUrl?: string, videoId?: string): MediaImage[] {
  const artwork: MediaImage[] = [];

  // Case 1: Google UserContent CDN (YouTube Music album covers) - perfect 1:1 squares
  if (
    thumbnailUrl &&
    (thumbnailUrl.includes('googleusercontent.com') || thumbnailUrl.includes('ggpht.com'))
  ) {
    const squareSizes = [96, 128, 192, 256, 384, 512];
    for (const size of squareSizes) {
      let src = thumbnailUrl;
      if (/=w\d+-h\d+.*$/.test(src)) {
        src = src.replace(/=w\d+-h\d+.*$/, `=w${size}-h${size}-l90-rj`);
      } else if (/=s\d+.*$/.test(src)) {
        src = src.replace(/=s\d+.*$/, `=s${size}-c-k-c0x00ffffff-no-rj`);
      } else if (!src.includes('=')) {
        src = `${src}=w${size}-h${size}-l90-rj`;
      }
      artwork.push({
        src,
        sizes: `${size}x${size}`,
        type: 'image/jpeg',
      });
    }
    return artwork;
  }

  // Case 2: Standard YouTube video thumbnails
  // Chrome on Android strictly looks for a 512x512 image in the array for lockscreen backgrounds.
  // We MUST provide a guaranteed working image (200 OK) with 512x512 declaration.
  // Note: maxresdefault.jpg returns 404 for 75%+ of YouTube videos and must NEVER be used.
  const id = videoId || (thumbnailUrl && thumbnailUrl.match(/vi\/([^/]+)/)?.[1]);
  const primaryThumb = thumbnailUrl || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');

  if (primaryThumb) {
    artwork.push({
      src: primaryThumb,
      sizes: '512x512',
      type: 'image/jpeg',
    });
    artwork.push({
      src: primaryThumb,
      sizes: '256x256',
      type: 'image/jpeg',
    });
  }

  if (id) {
    artwork.push(
      {
        src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        sizes: '192x192',
        type: 'image/jpeg',
      },
      {
        src: `https://i.ytimg.com/vi/${id}/default.jpg`,
        sizes: '96x96',
        type: 'image/jpeg',
      }
    );
  }

  return artwork;
}

/**
 * Creates a fully populated MediaMetadata object with cleaned title, artist,
 * album ("Rem Music"), and multi-resolution artwork.
 */
export function createMediaMetadata(track: Track): MediaMetadata | null {
  if (typeof window === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
    return null;
  }

  const title = cleanTitle(track.title, track.artist);
  const artist = cleanArtist(track.artist);
  const artwork = getOptimizedArtwork(track.thumbnail, track.id);

  return new MediaMetadata({
    title,
    artist,
    album: 'Rem Music',
    artwork,
  });
}

/**
 * Throttles setPositionState calls to avoid Android SystemUI IPC saturation and
 * scrubber micro-jitter.
 *
 * Android SystemUI smoothly extrapolates playback position locally at 60fps
 * using `playbackRate: 1.0`. Calling setPositionState on every timeupdate/ticker
 * tick (250ms) resets the OS animation timer and causes seekbar jitter.
 */
export class MediaPositionTracker {
  private lastReportedTime = 0;
  private lastPosition = 0;
  private lastDuration = 0;
  private lastPlaybackRate = 1;

  public report(
    position: number,
    duration: number,
    playbackRate = 1,
    force = false
  ): void {
    if (
      typeof window === 'undefined' ||
      !('mediaSession' in navigator) ||
      !('setPositionState' in navigator.mediaSession)
    ) {
      return;
    }

    if (!isFinite(duration) || duration <= 0 || !isFinite(position) || position < 0) {
      return;
    }

    // W3C MediaSession spec forbids playbackRate = 0 (throws TypeError)
    const safePlaybackRate =
      typeof playbackRate === 'number' && playbackRate > 0 ? playbackRate : 1;

    const clampedPosition = Math.max(0, Math.min(position, duration));
    const now = performance.now();

    if (!force) {
      const elapsedMs = now - this.lastReportedTime;
      // During continuous playback, only resync every 1.8 seconds or if drift > 1.2s
      if (elapsedMs < 1800 && Math.abs(duration - this.lastDuration) < 0.5) {
        const predictedPosition =
          this.lastPosition + (elapsedMs / 1000) * this.lastPlaybackRate;
        if (Math.abs(clampedPosition - predictedPosition) < 1.2) {
          return;
        }
      }
    }

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: safePlaybackRate,
        position: clampedPosition,
      });
      this.lastReportedTime = now;
      this.lastPosition = clampedPosition;
      this.lastDuration = duration;
      this.lastPlaybackRate = safePlaybackRate;
    } catch {
      // In some edge cases or browser tab visibility states, setPositionState might fail silently
    }
  }

  public reset(): void {
    this.lastReportedTime = 0;
    this.lastPosition = 0;
    this.lastDuration = 0;
    this.lastPlaybackRate = 1;
  }
}

export const mediaPositionTracker = new MediaPositionTracker();
