/**
 * streamResolver.ts — Client-only audio stream resolution.
 *
 * 1. On Android (Capacitor): Directly resolves unthrottled googlevideo.com audio
 *    stream URLs using on-device mobile InnerTube contexts (ANDROID_MUSIC / IOS).
 *    Bypasses CORS completely and plays directly on the phone.
 *
 * 2. On Web Browser: Attempts resolution via fast public CORS gateways (Piped)
 *    to enable Web Audio DSP, and immediately falls back to the autonomous
 *    YouTube IFrame engine if unassisted.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { useSettingsStore } from '../stores/settingsStore';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacy.com.de',
  'https://pipedapi.tokhmi.xyz',
];

/**
 * On-device Android stream resolver.
 * Calls YouTube InnerTube player endpoint directly over native sockets.
 */
async function resolveAndroidStream(videoId: string): Promise<string | null> {
  const clients = [
    {
      name: 'IOS',
      version: '19.29.1',
      userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU OS 17_5_1 like Mac OS X; US)',
      clientNameHeader: '5',
    },
    {
      name: 'ANDROID_MUSIC',
      version: '6.41.52',
      userAgent: 'com.google.android.apps.youtube.music/6.41.52 (Linux; U; Android 14; US)',
      clientNameHeader: '21',
    },
  ];

  for (const client of clients) {
    try {
      const response = await CapacitorHttp.post({
        url: 'https://music.youtube.com/youtubei/v1/player',
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
            },
          },
          videoId,
        },
      });

      if (response.status === 200 && response.data) {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        const formats = data.streamingData?.adaptiveFormats || [];

        // 1. Prioritize itag 251 (Opus 160kbps), then itag 140 (AAC 128kbps), then any audio stream with direct URL
        const directAudio =
          formats.find((f: any) => f.itag === 251 && f.url) ||
          formats.find((f: any) => f.itag === 140 && f.url) ||
          formats.find((f: any) => f.mimeType?.startsWith('audio/') && f.url);

        if (directAudio && directAudio.url) {
          return directAudio.url;
        }
      }
    } catch (err) {
      console.warn(`Android native stream resolution with ${client.name} failed:`, err);
    }
  }

  return null;
}

/**
 * Web browser public stream resolver (with fast 2-second timeout).
 */
async function resolveWebPublicStream(videoId: string): Promise<string | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2200);

      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const streams = data.audioStreams || [];
        const best =
          streams.find((s: any) => s.mimeType?.includes('opus')) ||
          streams.find((s: any) => s.quality?.includes('160')) ||
          streams[0];

        if (best && best.url) {
          return best.url;
        }
      }
    } catch {
      // Continue to next instance or fallback
    }
  }

  return null;
}

/**
 * Universal Stream Resolver.
 * Resolves the best available playback URL:
 * 1. Custom backend URL if configured in Settings.
 * 2. On Android: Direct on-device streaming URL from YouTube CDN.
 * 3. On Web: Fast public CORS stream, or null (triggering the YouTube IFrame engine).
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

  // 1. Android Native Platform -> Direct on-device stream
  if (Capacitor.isNativePlatform()) {
    const directUrl = await resolveAndroidStream(videoId);
    if (directUrl) {
      return { url: directUrl, engine: 'native' };
    }
    // Fallback: If on local network with PC server running
    return { url: `http://192.168.164.164:3001/api/stream/${videoId}`, engine: 'native' };
  }

  // 2. Web Browser -> Try fast public gateway for Web Audio DSP
  const webStreamUrl = await resolveWebPublicStream(videoId);
  if (webStreamUrl) {
    return { url: webStreamUrl, engine: 'html5' };
  }

  // 3. Web Browser Fallback -> YouTube IFrame Engine (100% resilient)
  return { url: null, engine: 'youtube' };
}
