/**
 * YouTube service — wraps yt-dlp CLI to search, get info, and extract stream URLs.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Innertube, { Log, type Types } from 'youtubei.js';

const execFileAsync = promisify(execFile);

// youtubei.js 18.3 cannot parse some of VISIONOS's ticket-shelf menus and logs
// a huge warning (with the whole classdata) for each one. On a 0.1-CPU
// instance that spam costs real time; keep only genuine errors.
Log.setLevel(Log.Level.ERROR);

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

interface YtDlpCommand {
  binary: string;
  prefixArgs: string[];
}

function findYtDlpCommand(): YtDlpCommand {
  const pythonCandidates = [
    resolve(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    resolve(process.cwd(), '..', '.venv', 'Scripts', 'python.exe'),
    resolve(process.cwd(), '.venv', 'bin', 'python'),
    resolve(process.cwd(), '..', '.venv', 'bin', 'python'),
    resolve(process.cwd(), 'venv', 'Scripts', 'python.exe'),
    resolve(process.cwd(), '..', 'venv', 'Scripts', 'python.exe'),
  ];

  for (const py of pythonCandidates) {
    if (existsSync(py)) {
      return { binary: py, prefixArgs: ['-m', 'yt_dlp'] };
    }
  }

  const binaryCandidates = [
    resolve(process.cwd(), '.venv', 'Scripts', 'yt-dlp.exe'),
    resolve(process.cwd(), '..', '.venv', 'Scripts', 'yt-dlp.exe'),
    resolve(process.cwd(), '.venv', 'bin', 'yt-dlp'),
    resolve(process.cwd(), '..', '.venv', 'bin', 'yt-dlp'),
    resolve(process.cwd(), 'venv', 'Scripts', 'yt-dlp.exe'),
    resolve(process.cwd(), '..', 'venv', 'Scripts', 'yt-dlp.exe'),
  ];

  for (const candidate of binaryCandidates) {
    if (existsSync(candidate)) {
      return { binary: candidate, prefixArgs: [] };
    }
  }

  return { binary: 'yt-dlp', prefixArgs: [] };
}

/**
 * Run yt-dlp with the given arguments. Returns stdout.
 */
async function runYtDlp(args: string[]): Promise<string> {
  const { binary, prefixArgs } = findYtDlpCommand();
  const allArgs = [...prefixArgs, ...args];
  try {
    const { stdout } = await execFileAsync(binary, allArgs, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    return stdout.trim();
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string; code?: string; killed?: boolean };
    if (error.code === 'ENOENT') {
      throw new Error(
        'yt-dlp is not installed or not in PATH / .venv. Install it: pip install yt-dlp'
      );
    }
    if (error.killed) {
      throw new Error('yt-dlp timed out after 120s (slow CPU or YouTube challenge stall)');
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
        params: 'EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFA==',
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
  /** Which resolver produced this URL, for diagnostics. */
  client?: string;
  itag?: number;
}

// ─── InnerTube stream resolver ───────────────────────────────
// Preferred path: uses the same InnerTube API as the catalog (which works on
// datacenter IPs), with in-process JS deciphering. yt-dlp is the fallback for
// networks where InnerTube player requests are refused.

let streamClientPromise: Promise<Innertube> | null = null;

function getStreamClient(): Promise<Innertube> {
  if (!streamClientPromise) {
    streamClientPromise = Innertube.create({
      lang: 'en',
      location: 'US',
      retrieve_player: true,
    }).catch((error) => {
      streamClientPromise = null;
      throw error;
    });
  }
  return streamClientPromise;
}

// YouTube bot-checks the /player endpoint per client and per IP. Datacenter IPs
// (Render/Railway/etc.) get 403 from the default WEB client, but other clients
// are often still allowed — try them in order until one returns a playable URL.
const STREAM_CLIENTS: Array<Types.InnerTubeClient> = [
  // VISIONOS returns plain deciphered URLs (no PO token client), and is the
  // client BitChord plays through in the browser. Try it first.
  'VISIONOS',
  'YTMUSIC_ANDROID',
  'ANDROID_VR',
  'TV_SIMPLY',
  'IOS',
  'WEB_EMBEDDED',
  'MWEB',
  'ANDROID',
  'TV',
  'YTMUSIC',
];

async function getStreamUrlViaInnertube(videoId: string): Promise<StreamResult> {
  const yt = await getStreamClient();
  let lastError: unknown = null;
  // YouTube's player endpoint is usually refused (403) for *every* client from
  // a blocked IP. Two consecutive 403s mean the IP is blocked, so the remaining
  // clients would only add ~8s each before the yt-dlp fallback.
  let forbidden = 0;

  for (const client of STREAM_CLIENTS) {
    try {
      const started = Date.now();
      // getBasicInfo is the player-only call. getInfo also fetches /next, which
      // YouTube refuses (403) from datacenter IPs even when /player succeeds.
      const info = await yt.getBasicInfo(videoId, { client });
      const audio = (info.streaming_data?.adaptive_formats ?? []).filter(
        (format) => format.has_audio && !format.has_video
      );

      // Prefer Opus 251, then AAC 140, then the next-best audio-only format.
      // Choosing manually avoids `chooseFormat`'s muxed fallback (itag 18),
      // which would proxy a whole video file for an audio track.
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
      const formatName = mime.includes('mp4') ? 'm4a' : mime.includes('webm') ? 'webm' : 'audio';

      console.log(
        `[stream] ${videoId} resolved via InnerTube client ${client} (itag ${format.itag}, ${Date.now() - started}ms)`
      );

      return {
        url,
        format: formatName,
        contentType: mime,
        loudnessDb: typeof format.loudness_db === 'number' ? format.loudness_db : undefined,
        headers: {},
        client,
        itag: format.itag,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[stream] ${videoId} InnerTube client ${client} failed: ${message}`);

      if (message.includes('status code 403')) {
        forbidden += 1;
        if (forbidden >= 2) {
          console.warn(
            `[stream] ${videoId} player endpoint is 403 for this IP; skipping the remaining InnerTube clients`
          );
          break;
        }
      } else {
        forbidden = 0;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All InnerTube clients failed to resolve the stream');
}

/**
 * Get the direct audio stream URL for a video.
 * Tries InnerTube first (fast, cloud-friendly), then yt-dlp (local/self-hosted).
 * yt-dlp prioritizes 48kHz Opus (itag 251) for bit-perfect hardware DAC decoding.
 */
export async function getStreamUrl(videoId: string): Promise<StreamResult> {
  try {
    return await getStreamUrlViaInnertube(videoId);
  } catch (innerTubeError) {
    const firstMessage =
      innerTubeError instanceof Error ? innerTubeError.message : String(innerTubeError);

    try {
      return await getStreamUrlViaYtDlp(videoId);
    } catch (ytdlpError) {
      const secondMessage =
        ytdlpError instanceof Error ? ytdlpError.message : String(ytdlpError);
      throw new Error(
        `Stream resolution failed (InnerTube: ${firstMessage}; yt-dlp: ${secondMessage})`
      );
    }
  }
}

async function getStreamUrlViaYtDlp(videoId: string): Promise<StreamResult> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const formatSelector = '251/140/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best';

  const stdout = await runYtDlp([
    '-f', formatSelector,
    '--dump-json',
    '--no-download',
    '--no-warnings',
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

/**
 * Ask every InnerTube client for the same track and report what each one
 * returned. Used to find which clients a datacenter IP is allowed to use and
 * which of those offer audio-only formats.
 */
export async function diagnosePlayer(
  videoId: string,
  clients: Array<Types.InnerTubeClient> = STREAM_CLIENTS
): Promise<
  Array<{
    client: string;
    ok: boolean;
    ms: number;
    status?: string;
    adaptiveAudio?: number[];
    muxed?: number[];
    error?: string;
  }>
> {
  const yt = await getStreamClient();
  const report = [];

  for (const client of clients) {
    const started = Date.now();
    try {
      // Player-only: /next is 403 from datacenter IPs and would hide the fact
      // that /player worked.
      const info = await yt.getBasicInfo(videoId, { client });
      const adaptiveAudio = (info.streaming_data?.adaptive_formats ?? [])
        .filter((format) => format.has_audio && !format.has_video)
        .map((format) => format.itag);
      const muxed = (info.streaming_data?.formats ?? [])
        .filter((format) => format.has_audio)
        .map((format) => format.itag);
      report.push({
        client,
        ok: true,
        ms: Date.now() - started,
        status: info.playability_status?.status,
        adaptiveAudio,
        muxed,
      });
    } catch (error) {
      report.push({
        client,
        ok: false,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
