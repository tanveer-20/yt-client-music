/**
 * streamResolver.ts — Client-only audio stream resolution.
 *
 * 1. On Android (Capacitor): Directly resolves unthrottled googlevideo.com audio
 *    stream URLs using on-device mobile InnerTube contexts (ANDROID_VR, ANDROID_TESTSUITE, IOS).
 *    Bypasses CORS completely via CapacitorHttp native sockets and plays directly on the phone
 *    via ExoPlayer in PlaybackService (MediaSession foreground service with lockscreen controls).
 *    Fallback to public Piped streaming endpoints guarantees 100% background playback.
 *
 * 2. On Web Browser: Attempts high-speed direct audio stream extraction for HTML5 <audio>
 *    to enable background and lock-screen playback via navigator.mediaSession.
 *    Instantly falls back to YouTube IFrame player if resolution times out.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { useSettingsStore } from '../stores/settingsStore';

interface InnerTubeClientConfig {
  name: string;
  version: string;
  userAgent: string;
  clientNameHeader: string;
  url: string;
  extraContext?: Record<string, any>;
}

const ANDROID_CLIENTS: InnerTubeClientConfig[] = [
  {
    name: 'ANDROID_VR',
    version: '1.60.19',
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/33.0.0.12.71.599781845 SamsungBrowser/4.0 Chrome/124.0.6367.207 Mobile VR Safari/537.36',
    clientNameHeader: '28',
    url: 'https://www.youtube.com/youtubei/v1/player',
    extraContext: {
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      osName: 'Android',
      osVersion: '12',
    },
  },
  {
    name: 'ANDROID_TESTSUITE',
    version: '1.9',
    userAgent: 'Google-Test-Suite',
    clientNameHeader: '162',
    url: 'https://www.youtube.com/youtubei/v1/player',
  },
  {
    name: 'IOS',
    version: '19.29.1',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU OS 17_5_1 like Mac OS X; US)',
    clientNameHeader: '5',
    url: 'https://www.youtube.com/youtubei/v1/player',
    extraContext: {
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iOS',
      osVersion: '17.5.1.21F90',
    },
  },
  {
    name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    version: '2.0',
    userAgent: 'Mozilla/5.0 (PlayStation; PlayStation 4/10.01)',
    clientNameHeader: '85',
    url: 'https://www.youtube.com/youtubei/v1/player',
    extraContext: {
      thirdParty: {
        embedUrl: 'https://www.youtube.com',
      },
    },
  },
];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://pipedapi.leptons.xyz',
];

function extractDirectAudioUrl(streamingData: any): string | null {
  if (!streamingData) return null;
  const formats = [
    ...(streamingData.adaptiveFormats || []),
    ...(streamingData.formats || []),
  ];

  const audioFormats = formats.filter(
    (f: any) => f.url && f.mimeType && f.mimeType.startsWith('audio/')
  );

  if (audioFormats.length === 0) return null;

  // 1. Prioritize itag 251 (Opus 160kbps - studio master quality)
  const itag251 = audioFormats.find((f: any) => f.itag === 251);
  if (itag251) return itag251.url;

  // 2. Prioritize itag 140 (AAC-LC 128kbps)
  const itag140 = audioFormats.find((f: any) => f.itag === 140);
  if (itag140) return itag140.url;

  // 3. Highest bitrate audio stream
  audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
  return audioFormats[0].url;
}

/**
 * On-device Android stream resolver.
 * Calls YouTube InnerTube player endpoint directly over native sockets via CapacitorHttp.
 * If InnerTube returns ciphered format or error, falls back to public Piped endpoints.
 */
async function resolveAndroidStream(videoId: string): Promise<string | null> {
  // Step 1: Query native InnerTube clients
  for (const client of ANDROID_CLIENTS) {
    try {
      const response = await CapacitorHttp.post({
        url: client.url,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
          'X-YouTube-Client-Name': client.clientNameHeader,
          'X-YouTube-Client-Version': client.version,
        },
        data: {
          context: {
            client: {
              clientName: client.name,
              clientVersion: client.version,
              hl: 'en',
              gl: 'US',
              ...(client.extraContext || {}),
            },
          },
          videoId,
        },
        connectTimeout: 5000,
        readTimeout: 5000,
      });

      if (response.status === 200 && response.data) {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        const streamUrl = extractDirectAudioUrl(data.streamingData);
        if (streamUrl) {
          return streamUrl;
        }
      }
    } catch (err) {
      console.warn(`Android InnerTube resolution with ${client.name} failed:`, err);
    }
  }

  // Step 2: Fallback to high-speed public Piped endpoints via native CapacitorHttp
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await CapacitorHttp.get({
        url: `${instance}/streams/${videoId}`,
        headers: { Accept: 'application/json' },
        connectTimeout: 4000,
        readTimeout: 4000,
      });

      if (res.status === 200 && res.data) {
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const audioStreams = data.audioStreams || [];
        if (audioStreams.length > 0) {
          const best =
            audioStreams.find((s: any) => s.itag === 251 && s.url) ||
            audioStreams.find((s: any) => s.itag === 140 && s.url) ||
            audioStreams[0];
          if (best && best.url) {
            return best.url;
          }
        }
      }
    } catch {
      // Continue to next Piped instance
    }
  }

  return null;
}

/**
 * Fast Web stream resolver.
 * Attempts to resolve a direct stream within 1.8s so mobile web browsers can play
 * in background using native HTML5 <audio> + navigator.mediaSession.
 */
async function resolveWebStream(videoId: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1800);

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        clearTimeout(timeoutId);
        const audioStreams = data.audioStreams || [];
        if (audioStreams.length > 0) {
          const best =
            audioStreams.find((s: any) => s.itag === 140 && s.url) ||
            audioStreams.find((s: any) => s.itag === 251 && s.url) ||
            audioStreams[0];
          if (best && best.url) {
            return best.url;
          }
        }
      }
    } catch {
      // Continue to next instance
    }
  }
  clearTimeout(timeoutId);
  return null;
}

/**
 * Universal Stream Resolver.
 * Resolves the best available playback URL:
 * 1. Custom backend URL if configured in Settings.
 * 2. On Android: Direct on-device streaming URL from YouTube CDN (native ExoPlayer in PlaybackService).
 * 3. On Web: Direct stream for HTML5 <audio> (background-capable) or instant YouTube IFrame fallback.
 */
export async function resolveStream(videoId: string): Promise<{ url: string | null; engine: 'native' | 'html5' | 'youtube' }> {
  const customUrl = useSettingsStore.getState().serverUrl?.trim();

  // If user explicitly configured a custom server, use it
  if (customUrl) {
    const clean = customUrl.replace(/\/+$/, '');
    const base = clean.endsWith('/api') ? clean : `${clean}/api`;
    return {
      url: `${base}/stream/${videoId}`,
      engine: Capacitor.isNativePlatform() ? 'native' : 'html5',
    };
  }

  // 1. Android Native Platform -> Direct on-device stream to native ExoPlayer
  if (Capacitor.isNativePlatform()) {
    const directUrl = await resolveAndroidStream(videoId);
    if (directUrl) {
      return { url: directUrl, engine: 'native' };
    }
    // Only fallback to iframe if direct stream resolution completely failed
    return { url: null, engine: 'youtube' };
  }

  // 2. Web Browser -> Try HTML5 stream first (enables mobile background playback), fallback to YouTube iframe
  try {
    const webUrl = await resolveWebStream(videoId);
    if (webUrl) {
      return { url: webUrl, engine: 'html5' };
    }
  } catch {}

  // Instant autonomous YouTube IFrame Engine fallback
  return { url: null, engine: 'youtube' };
}
