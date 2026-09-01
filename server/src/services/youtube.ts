/**
 * YouTube service — wraps yt-dlp CLI to search, get info, and extract stream URLs.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ─── Types ───────────────────────────────────────────────────

export interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // seconds
}

export interface TrackInfo extends Track {
  description?: string;
  viewCount?: number;
  uploadDate?: string;
  channel?: string;
}



// ─── Helpers ─────────────────────────────────────────────────

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function findYtDlpBinary(): string {
  // Check local .venv in root or server directory
  const candidates = [
    resolve(process.cwd(), '.venv', 'Scripts', 'yt-dlp.exe'),
    resolve(process.cwd(), '..', '.venv', 'Scripts', 'yt-dlp.exe'),
    resolve(process.cwd(), '.venv', 'bin', 'yt-dlp'),
    resolve(process.cwd(), '..', '.venv', 'bin', 'yt-dlp'),
    resolve(process.cwd(), 'venv', 'Scripts', 'yt-dlp.exe'),
    resolve(process.cwd(), '..', 'venv', 'Scripts', 'yt-dlp.exe'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'yt-dlp';
}

/**
 * Run yt-dlp with the given arguments. Returns stdout.
 */
async function runYtDlp(args: string[]): Promise<string> {
  const binary = findYtDlpBinary();
  try {
    const { stdout } = await execFileAsync(binary, args, {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    return stdout.trim();
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string; code?: string };
    if (error.code === 'ENOENT') {
      throw new Error(
        'yt-dlp is not installed or not in PATH / .venv. Install it: pip install yt-dlp'
      );
    }
    const message = error.stderr || error.message || 'yt-dlp failed';
    throw new Error(`yt-dlp error: ${message}`);
  }
}

/**
 * Pick the best thumbnail URL from yt-dlp JSON output.
 */
function pickThumbnail(data: Record<string, unknown>): string {
  const thumbnails = data.thumbnails as Array<{ url: string; preference?: number }> | undefined;
  if (thumbnails && thumbnails.length > 0) {
    // Sort by preference descending, pick highest
    const sorted = [...thumbnails].sort(
      (a, b) => (b.preference ?? 0) - (a.preference ?? 0)
    );
    return sorted[0].url;
  }
  return (data.thumbnail as string) || '';
}

/**
 * Parse a single yt-dlp JSON dump into a Track object.
 */
function parseTrack(data: Record<string, unknown>): Track {
  return {
    id: (data.id as string) || '',
    title: (data.title as string) || (data.fulltitle as string) || 'Unknown',
    artist:
      (data.artist as string) ||
      (data.channel as string) ||
      (data.uploader as string) ||
      'Unknown Artist',
    thumbnail: pickThumbnail(data),
    duration: typeof data.duration === 'number' ? data.duration : 0,
  };
}

function parseDurationText(text?: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return 0;
}

/**
 * Fast direct search via YouTube Music InnerTube endpoint (WEB_REMIX).
 * Strictly searches official music catalogue (Audio Track Videos / Topic releases).
 */
async function searchYouTubeMusicFast(query: string, limit = 10): Promise<Track[]> {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com/',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query,
      }),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as any;
    const sections =
      data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    const tracks: Track[] = [];
    const seen = new Set<string>();

    function addTrack(title?: string, artist?: string, videoId?: string, thumbs?: any[], durationStr?: string) {
      if (!videoId || seen.has(videoId)) return;
      seen.add(videoId);

      let thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      if (thumbs && thumbs.length > 0) {
        thumbUrl = thumbs[thumbs.length - 1].url.replace(/=w\d+-h\d+/, '=w544-h544');
      }

      tracks.push({
        id: videoId,
        title: title || 'Unknown',
        artist: artist || 'Unknown Artist',
        thumbnail: thumbUrl,
        duration: parseDurationText(durationStr),
      });
    }

    for (const s of sections) {
      if (s.musicCardShelfRenderer) {
        const card = s.musicCardShelfRenderer;
        const title = card.title?.runs?.[0]?.text;
        const artist = card.subtitle?.runs?.[0]?.text;
        const videoId =
          card.onTap?.watchEndpoint?.videoId ||
          card.buttons?.[0]?.buttonRenderer?.command?.watchEndpoint?.videoId;
        const thumbs = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
        addTrack(title, artist, videoId, thumbs);
      }

      const shelfItems = s.musicShelfRenderer?.contents || s.itemSectionRenderer?.contents || [];
      for (const item of shelfItems) {
        const r = item.musicResponsiveListItemRenderer;
        if (r) {
          const videoId =
            r.playlistItemData?.videoId ||
            r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
            r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const runs = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          const artist =
            runs
              .map((x: any) => x.text)
              .filter((t: string) => t && t !== ' • ' && !t.includes(':') && t !== 'Song' && t !== 'Album' && t !== 'Video')
              .join(', ') || 'Unknown Artist';

          const durationRun = runs.find((x: any) => /^\d+:\d+$/.test(x.text));
          const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;

          addTrack(title, artist, videoId, thumbs, durationRun?.text);
          if (tracks.length >= limit) return tracks;
        }
      }
    }

    return tracks;
  } catch (err) {
    console.warn('YouTube Music search failed, falling back to YouTube Web:', err);
    return [];
  }
}

/**
 * Fast direct search via YouTube InnerTube endpoint (<100ms response time).
 */
async function searchYouTubeFast(query: string, limit = 10): Promise<Track[]> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00',
          hl: 'en',
          gl: 'US',
        },
      },
      query,
    }),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as any;
  const sections =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ||
    data.contents?.sectionListRenderer?.contents ||
    [];

  const tracks: Track[] = [];
  const seenIds = new Set<string>();

  function extractItem(item: any) {
    const v = item.videoRenderer || item.compactVideoRenderer;
    if (v && v.videoId && !seenIds.has(v.videoId)) {
      seenIds.add(v.videoId);
      const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown';
      const artist =
        v.ownerText?.runs?.[0]?.text ||
        v.longBylineText?.runs?.[0]?.text ||
        v.shortBylineText?.runs?.[0]?.text ||
        'Unknown Artist';

      const thumbs = v.thumbnail?.thumbnails || [];
      const thumbUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const durationText = v.lengthText?.simpleText || v.lengthText?.accessibility?.accessibilityData?.label;
      const duration = parseDurationText(durationText);

      tracks.push({
        id: v.videoId,
        title,
        artist,
        thumbnail: thumbUrl,
        duration,
      });
    }

    if (item.shelfRenderer) {
      const shelfItems =
        item.shelfRenderer.content?.verticalListRenderer?.items ||
        item.shelfRenderer.content?.expandedShelfContentsRenderer?.items ||
        [];
      for (const si of shelfItems) {
        extractItem(si);
        if (tracks.length >= limit) return;
      }
    }
  }

  for (const s of sections) {
    const items = s.itemSectionRenderer?.contents || [];
    for (const item of items) {
      extractItem(item);
      if (tracks.length >= limit) return tracks;
    }
  }

  return tracks;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Search YouTube for tracks matching the query.
 * Uses high-speed YouTube Music InnerTube API first, falling back to YouTube Web and yt-dlp.
 */
export async function searchTracks(query: string, limit = 10): Promise<Track[]> {
  try {
    const ytmResults = await searchYouTubeMusicFast(query, limit);
    if (ytmResults.length > 0) {
      return ytmResults;
    }
  } catch (err) {
    console.warn('YTM fast search failed, falling back to standard YouTube:', err);
  }

  try {
    const fastResults = await searchYouTubeFast(query, limit);
    if (fastResults.length > 0) {
      return fastResults;
    }
  } catch (err) {
    console.warn('Fast search failed, falling back to yt-dlp:', err);
  }

  // Fallback to yt-dlp
  const stdout = await runYtDlp([
    `ytsearch${limit}:${query}`,
    '--dump-json',
    '--flat-playlist',
    '--no-download',
    '--no-warnings',
    '--ignore-errors',
    '--default-search', 'ytsearch',
  ]);

  if (!stdout) return [];

  const tracks: Track[] = [];
  const lines = stdout.split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const data = JSON.parse(line) as Record<string, unknown>;
      const track = parseTrack(data);
      if (track.id) tracks.push(track);
    } catch {
      // Skip malformed JSON lines
    }
  }

  return tracks;
}

/**
 * Get detailed info for a specific video/track.
 */
export async function getTrackInfo(videoId: string): Promise<TrackInfo> {
  const stdout = await runYtDlp([
    `https://www.youtube.com/watch?v=${videoId}`,
    '--dump-json',
    '--no-download',
    '--no-warnings',
  ]);

  const data = JSON.parse(stdout) as Record<string, unknown>;

  return {
    ...parseTrack(data),
    description: (data.description as string) || undefined,
    viewCount: typeof data.view_count === 'number' ? data.view_count : undefined,
    uploadDate: (data.upload_date as string) || undefined,
    channel: (data.channel as string) || (data.uploader as string) || undefined,
  };
}

export interface StreamResult {
  url: string;
  format: string;
  contentType: string;
  loudnessDb?: number;
  headers?: Record<string, string>;
}

/**
 * Get the direct audio stream URL for a video in a single fast yt-dlp call.
 * Prioritizes 48kHz Opus (itag 251) for bit-perfect hardware DAC decoding.
 */
export async function getStreamUrl(videoId: string): Promise<StreamResult> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const formatSelector = '251/bestaudio[acodec=opus]/bestaudio/best';

  const stdout = await runYtDlp([
    '-f', formatSelector,
    '--dump-json',
    '--no-download',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=android,web_remix',
    url,
  ]);

  const data = JSON.parse(stdout) as Record<string, unknown>;
  const streamUrl = (data.url as string) || '';
  const format = (data.ext as string) || 'webm';
  const httpHeaders = (data.http_headers as Record<string, string>) || {};

  // Extract loudnessDb from player_response if available
  let loudnessDb: number | undefined;
  try {
    const playerResponse = (data.player_response as any) || {};
    const audioConfig = playerResponse.playerConfig?.audioConfig;
    if (typeof audioConfig?.loudnessDb === 'number') {
      loudnessDb = audioConfig.loudnessDb;
    }
  } catch {}

  const contentTypeMap: Record<string, string> = {
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    webm: 'audio/webm; codecs="opus"',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
  };

  return {
    url: streamUrl,
    format,
    contentType: contentTypeMap[format] || 'audio/webm; codecs="opus"',
    loudnessDb,
    headers: httpHeaders,
  };
}

/**
 * Get suggested/related tracks for a video.
 */
export async function getSuggestions(videoId: string): Promise<Track[]> {
  try {
    // Use yt-dlp to extract related videos from the watch page
    const stdout = await runYtDlp([
      `https://www.youtube.com/watch?v=${videoId}`,
      '--flat-playlist',
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--extractor-args', 'youtube:player_skip=webpage',
    ]);

    if (!stdout) return [];

    const tracks: Track[] = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const data = JSON.parse(line) as Record<string, unknown>;
        const track = parseTrack(data);
        // Skip the original video
        if (track.id && track.id !== videoId) {
          tracks.push(track);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return tracks.slice(0, 10);
  } catch {
    // Suggestions are best-effort
    return [];
  }
}

/**
 * Check if yt-dlp is installed and accessible.
 */
export async function checkYtDlp(): Promise<{ installed: boolean; version?: string }> {
  try {
    const version = await runYtDlp(['--version']);
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}
