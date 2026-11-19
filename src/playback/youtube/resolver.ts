/**
 * Resolve a playable googlevideo URL from the browser.
 *
 * VISIONOS leads because it returns plain deciphered URLs and is not a
 * PO-token client, so it needs no BotGuard work (the same client BitChord
 * plays through). The Android/TV clients follow as fallbacks; the web clients
 * are deliberately omitted until PO-token minting is wired up.
 */

import type { Types } from 'youtubei.js/web';
import { getInnertube } from './session';

export interface DirectStream {
  url: string;
  /** File container, e.g. "webm" or "m4a". */
  format: string;
  contentType: string;
  itag: number;
  /** Epoch milliseconds after which the URL should be re-resolved. */
  expiresAt: number;
}

const CLIENTS: Array<Types.InnerTubeClient> = ['VISIONOS', 'IOS', 'ANDROID_VR', 'TV_SIMPLY'];

/** Re-resolve this long before the URL's own `expire` timestamp. */
const EXPIRY_MARGIN_MS = 5 * 60_000;
const FALLBACK_TTL_MS = 30 * 60_000;

function expiryOf(url: string): number {
  try {
    const expire = Number(new URL(url).searchParams.get('expire'));
    if (Number.isFinite(expire) && expire > 0) {
      return Math.max(Date.now() + 60_000, expire * 1000 - EXPIRY_MARGIN_MS);
    }
  } catch {
    /* fall through */
  }
  return Date.now() + FALLBACK_TTL_MS;
}

export async function resolveDirectStream(videoId: string): Promise<DirectStream> {
  const yt = await getInnertube();
  let lastError: unknown = null;

  for (const client of CLIENTS) {
    try {
      const info = await yt.getInfo(videoId, { client });
      const audio = (info.streaming_data?.adaptive_formats ?? []).filter(
        (format) => format.has_audio && !format.has_video
      );

      // Prefer Opus 251, then AAC 140, then the next-best audio-only format.
      // Choosing manually avoids a muxed fallback that would download video.
      let format = [251, 140, 250, 249]
        .map((itag) => audio.find((candidate) => candidate.itag === itag))
        .find((candidate) => candidate !== undefined);

      if (!format) {
        format = audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      }

      if (!format) {
        throw new Error('no audio-only format in the player response');
      }

      const url = await format.decipher(yt.session.player);
      if (!url) {
        throw new Error(`no deciphered URL (itag ${format.itag})`);
      }

      const mime = format.mime_type || 'audio/webm; codecs="opus"';
      const name = mime.includes('mp4') ? 'm4a' : mime.includes('webm') ? 'webm' : 'audio';

      return {
        url,
        format: name,
        contentType: mime,
        itag: format.itag,
        expiresAt: expiryOf(url),
      };
    } catch (error) {
      lastError = error;
      console.warn(`[playback] ${client} could not resolve ${videoId}:`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No YouTube client could resolve this track');
}
