/**
 * streamResolver.ts — Client-only audio stream resolution.
 *
 * 1. On Android (Capacitor): Directly resolves unthrottled googlevideo.com audio
 *    stream URLs using on-device mobile InnerTube contexts (ANDROID_MUSIC / IOS).
 *    Bypasses CORS completely and plays directly on the phone via ExoPlayer.
 *
 * 2. On Web Browser: Autonomous YouTube IFrame engine (instant 0ms resolution,
 *    preserves transient user activation for immediate first-click autoplay).
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { useSettingsStore } from '../stores/settingsStore';

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

        // Prioritize itag 251 (Opus 160kbps), then itag 140 (AAC 128kbps), then any direct audio stream
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
 * Universal Stream Resolver.
 * Resolves the best available playback URL:
 * 1. Custom backend URL if configured in Settings.
 * 2. On Android: Direct on-device streaming URL from YouTube CDN.
 * 3. On Web: Instant YouTube IFrame engine (autonomous, 0ms, preserves user autoplay gesture).
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
    return { url: null, engine: 'youtube' };
  }

  // 2. Web Browser -> Autonomous YouTube IFrame Engine (instant 0ms, preserves transient user activation for autoplay)
  return { url: null, engine: 'youtube' };
}
