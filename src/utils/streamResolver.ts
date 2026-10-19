/**
 * streamResolver.ts — Client-only audio stream resolution.
 *
 * 1. On Android (Capacitor): Directly resolves unthrottled googlevideo.com audio
 *    stream URLs using on-device mobile InnerTube contexts (ANDROID_VR, ANDROID_TESTSUITE, IOS).
 *    Bypasses CORS completely via CapacitorHttp native sockets and plays directly on the phone
 *    via ExoPlayer in PlaybackService (MediaSession foreground service with lockscreen controls).
 *    Fallback to public Piped streaming endpoints guarantees 100% background playback.
 *
 * 2. On Web Browser: Uses the same-origin /api/stream proxy where deployed (InnerTube-resolved,
 *    CORS-enabled, Range-capable audio) so the HTML5 <audio> engine can own playback —
 *    enabling background playback and lock-screen controls via navigator.mediaSession.
 *    Piped instances are an opportunistic fallback; the YouTube IFrame player is the last resort.
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
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
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

// Hedge against backends that cannot resolve streams (YouTube's bot wall does reject
// some datacenter egress): cache a failure per backend for 12h so we don't pay the
// probe stall on every track — the first play falls back, everything after is instant.
const BACKEND_DEAD_TTL_MS = 12 * 60 * 60 * 1000;
const BACKEND_DEAD_KEY = 'rem:stream-backend-dead';

function readBackendDead(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BACKEND_DEAD_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function isBackendDead(base: string): boolean {
  const dead = readBackendDead();
  return (dead[base] || 0) > Date.now();
}

function markBackendDead(base: string): void {
  try {
    const dead = readBackendDead();
    dead[base] = Date.now() + BACKEND_DEAD_TTL_MS;
    localStorage.setItem(BACKEND_DEAD_KEY, JSON.stringify(dead));
  } catch {
    // Private mode / storage disabled — fall back to in-memory behaviour
  }
}

function clearBackendDead(base: string): void {
  try {
    const dead = readBackendDead();
    if (!(base in dead)) return;
    delete dead[base];
    localStorage.setItem(BACKEND_DEAD_KEY, JSON.stringify(dead));
  } catch {}
}

/**
 * Web stream resolver — background-playback-capable.
 * 1. Backend /api/stream proxy (same-origin on local dev/self-hosted, or the custom
 *    server from Settings): InnerTube-resolved, CORS-enabled, Range-capable audio for
 *    HTML5 <audio> → mobile background playback + lock-screen controls (our notification).
 * 2. Public Piped instances — opportunistic free fallback (all verified dead as of 2026).
 * Returns null when everything fails, so the caller falls back to the YouTube iframe.
 */
async function resolveWebStream(videoId: string): Promise<string | null> {
  const backendBase = getBackendStreamBase();

  // 1. Backend stream proxy. A HEAD probe validates that the proxy can actually resolve
  //    this track before committing to the HTML5 engine.
  if (backendBase && !isBackendDead(backendBase)) {
    const probeUrl = `${backendBase}/stream/${videoId}`;
    const probeController = new AbortController();
    const probeTimeout = setTimeout(() => probeController.abort(), 8000);
    try {
      const probe = await fetch(probeUrl, {
        method: 'HEAD',
        signal: probeController.signal,
      });
      if (probe.ok || probe.status === 206) {
        clearBackendDead(backendBase);
        return probeUrl;
      }
      // 400/404 mean this specific track is bad — don't condemn the whole backend.
      // 5xx means the proxy itself cannot resolve (IP block / YouTube rejection).
      if (probe.status >= 500) markBackendDead(backendBase);
    } catch {
      markBackendDead(backendBase);
    } finally {
      clearTimeout(probeTimeout);
    }
  }

  // 2. Public Piped instances, raced in parallel with a single short deadline.
  //    (Sequentially probing three dead instances cost 4.5s of first-play delay.)
  if (!backendBase || !isBackendDead(backendBase)) {
    const piped = await Promise.race([
      Promise.allSettled(
        PIPED_INSTANCES.map(async (instance) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1800);
          try {
            const res = await fetch(`${instance}/streams/${videoId}`, {
              signal: controller.signal,
              headers: { Accept: 'application/json' },
            });
            if (!res.ok) return null;
            const data = await res.json();
            const audioStreams = data.audioStreams || [];
            if (audioStreams.length === 0) return null;
            const best =
              audioStreams.find((s: any) => s.itag === 140 && s.url) ||
              audioStreams.find((s: any) => s.itag === 251 && s.url) ||
              audioStreams[0];
            return best && best.url ? best.url : null;
          } catch {
            return null;
          } finally {
            clearTimeout(timeoutId);
          }
        })
      ).then((results) => {
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) return result.value;
        }
        return null;
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2200)),
    ]);
    if (piped) return piped;
  }

  return null;
}

/**
 * A plain-http custom server cannot be reached from an https:// page (mixed-content
 * block), so ignore such settings on web and fall through to the same-origin backend.
 * Native (Capacitor) uses native sockets, where http is fine.
 */
function isCustomServerUsable(customUrl: string): boolean {
  if (Capacitor.isNativePlatform()) return true;
  try {
    const url = new URL(customUrl);
    const pageIsHttps =
      typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (pageIsHttps && url.protocol === 'http:' && !isLocal) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the backend API stream base URL.
 * Returns null if no backend is usable (e.g. static deployment with no server).
 */
function getBackendStreamBase(): string | null {
  const customUrl = useSettingsStore.getState().serverUrl?.trim();
  if (customUrl && isCustomServerUsable(customUrl)) {
    const clean = customUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  // On same-origin deployments (Vercel, local dev), /api is the backend
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/api`;
  }
  return null;
}

/**
 * Universal Stream Resolver.
 * Resolves the best available playback URL:
 * 1. Custom backend URL if configured in Settings.
 * 2. On Android: Direct on-device streaming URL from YouTube CDN (native ExoPlayer in PlaybackService).
 * 3. On Web: Backend /api/stream proxy → HTML5 <audio> (background-capable); YouTube iframe fallback.
 */
export async function resolveStream(videoId: string): Promise<{ url: string | null; engine: 'native' | 'html5' | 'youtube' }> {
  const customUrl = useSettingsStore.getState().serverUrl?.trim();

  // If user explicitly configured a custom server, use it — unless it's unreachable
  // from this page (http:// server on an https:// page is blocked as mixed content).
  if (customUrl && isCustomServerUsable(customUrl)) {
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

  // 2. Web Browser -> /api/stream proxy so the top-level HTML5 <audio> element owns
  // playback (background playback + app-owned MediaSession notification). Falls back
  // to the YouTube IFrame player only when no stream URL can be resolved.
  const webUrl = await resolveWebStream(videoId);
  if (webUrl) {
    return { url: webUrl, engine: 'html5' };
  }
  return { url: null, engine: 'youtube' };
}
