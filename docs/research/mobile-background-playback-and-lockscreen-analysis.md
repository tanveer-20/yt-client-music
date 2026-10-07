# Deep Investigation: Mobile Background Playback & Lock-Screen Audio Analysis

**Date:** October 8, 2026  
**Target:** Rem YouTube Music Client (Android APK & Mobile Web App)  
**Status:** Complete Root-Cause Audit & Implementation Architecture

---

## 1. Executive Summary

When playing a song in **Rem**, minimizing the app or locking the phone immediately pauses audio playback on both the **Android APK** and the **Mobile Web App**.

Our primary-source code audit of `src/hooks/useAudioPlayer.ts`, `src/utils/streamResolver.ts`, and `android/app/src/main/java/com/ytmusic/app/` reveals the exact mechanism:

1. **Mobile Web App Root Cause**:
   - The web app relies entirely on the **YouTube IFrame Player API** (`activeMode === 'youtube'`).
   - The YouTube IFrame API internally hooks into the **W3C Page Visibility API** (`document.addEventListener('visibilitychange')`).
   - When the user minimizes the mobile browser or locks the phone (`document.visibilityState === 'hidden'`), the YouTube IFrame embed script **explicitly and intentionally executes `pauseVideo()`** to enforce YouTube's platform policy (restricting background playback to YouTube Premium).
   - Furthermore, mobile browser engines (Chromium Blink on Android and WebKit on iOS) actively suspend audio and render pipelines in background cross-origin iframes. Background playback on mobile web is **exclusively permitted for top-level HTML5 `<audio>` elements** that bind to the W3C `navigator.mediaSession` API.

2. **Android APK Root Cause**:
   - The Android codebase **already includes** a high-performance native background engine: [`PlaybackService.java`](file:///C:/Users/hp/Desktop/personal/yt-client/android/app/src/main/java/com/ytmusic/app/PlaybackService.java), which implements Android Media3 `MediaSessionService` with `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`, `WAKE_MODE_NETWORK`, `WifiLock`, `PARTIAL_WAKE_LOCK`, and system lock-screen notification controls.
   - **However, this native service is currently completely bypassed.**
   - In [`src/utils/streamResolver.ts`](file:///C:/Users/hp/Desktop/personal/yt-client/src/utils/streamResolver.ts), `resolveAndroidStream` queries `https://music.youtube.com/youtubei/v1/player` using mismatched client headers (`IOS` on `music.youtube.com`), and YouTube returns signature-ciphered streams (`f.signatureCipher`) rather than raw direct `f.url`.
   - Because `f.url` is missing, `resolveAndroidStream` returns `null`.
   - On line 106, `resolveStream` falls back to `{ url: null, engine: 'youtube' }`.
   - As a result, the APK plays the song inside a **Capacitor WebView IFrame** instead of calling `NativeAudio.play()`.
   - When the phone is locked or minimized, `MainActivity.onPause()`/`onStop()` triggers, the WebView is placed into sleep mode, Chromium freezes JavaScript timers, and the YouTube IFrame pauses.

---

## 2. Root Cause Analysis

### 2.1 The Mobile Web App (Browsers: Chrome, Safari, Firefox)

#### A. W3C Page Visibility & YouTube Embed Policy
The W3C Page Visibility specification defines:
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Screen locked or tab backgrounded
  }
});
```
The YouTube embedded player script (`https://www.youtube.com/s/player/.../base.js`) attaches an observer to page visibility and window focus. When the browser tab is hidden or minimized:
1. YouTube's player script intercepts the event.
2. It immediately halts HTML5 video buffer decoding and sends an internal `COMMAND_PAUSE` to the player engine.
3. This is an intentional commercial safeguard by Google: YouTube allows free video embeds on external websites, but restricts background listening and screen-off playback exclusively to paid **YouTube Premium** subscribers.

#### B. Chromium & WebKit Mobile Process Freezing
Even if one attempts to intercept the visibility event, mobile operating systems treat background tabs aggressively:
- Chromium (Android): Suspends rendering loops, throttles JS timers to $\le 1\text{ Hz}$, and pauses cross-origin iframe media decoding after 5 seconds to conserve battery and thermal budget.
- WebKit (iOS Safari): Instantly freezes all iframe execution and drops audio focus when the app is minimized.

#### The Web Rule:
> **In mobile web browsers, background audio and lock-screen playback can ONLY be maintained if the audio is decoded by a top-level native HTML5 `<audio>` element linked to `navigator.mediaSession`.** Cross-origin YouTube iframes can never play in the background on mobile browsers.

---

### 2.2 The Android APK (Capacitor WebView)

#### A. Existing Native Architecture in Rem
Rem already contains the necessary native infrastructure in `android/app/src/main/`:
- `AndroidManifest.xml`:
  - `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permissions.
  - `WAKE_LOCK` permission.
  - `POST_NOTIFICATIONS` permission.
  - Service declaration:
    ```xml
    <service
        android:name=".PlaybackService"
        android:exported="true"
        android:foregroundServiceType="mediaPlayback">
        <intent-filter>
            <action android:name="androidx.media3.session.MediaSessionService" />
        </intent-filter>
    </service>
    ```
- `PlaybackService.java`:
  - Inherits from `androidx.media3.session.MediaSessionService`.
  - Configures `ExoPlayer` with `C.WAKE_MODE_NETWORK` (acquires `PowerManager.PARTIAL_WAKE_LOCK` and `WifiLock`).
  - Calls `startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)`.
  - Builds rich `NotificationCompat` with public lock-screen visibility and media controls (Play/Pause/Skip).

When ExoPlayer in `PlaybackService` is fed a valid direct audio URL, **it does not stop when minimized or locked**. It continues streaming through Android OS Doze mode.

#### B. Why It Currently Fails
The breakdown occurs in [`src/utils/streamResolver.ts`](file:///C:/Users/hp/Desktop/personal/yt-client/src/utils/streamResolver.ts):
```typescript
async function resolveAndroidStream(videoId: string): Promise<string | null> {
  const clients = [
    {
      name: 'IOS',
      version: '19.29.1',
      userAgent: 'com.google.ios.youtube/19.29.1...',
      clientNameHeader: '5',
    },
    {
      name: 'ANDROID_MUSIC',
      version: '6.41.52',
      userAgent: 'com.google.android.apps.youtube.music/6.41.52...',
      clientNameHeader: '21',
    },
  ];

  for (const client of clients) {
    // POST https://music.youtube.com/youtubei/v1/player
    ...
    // formats.find(f => f.itag === 251 && f.url)
  }
  return null;
}
```
Two critical issues occur here:
1. **Endpoint/Client Mismatch**: Sending `clientName: 'IOS'` (header 5, YouTube Main) to `music.youtube.com` results in rejection or empty adaptive formats.
2. **Signature Ciphering**: YouTube serves formats with `signatureCipher` (scrambled `s` parameter) instead of raw `url`. Because `streamResolver.ts` checks only `f.url`, `directAudio` is `undefined`.
3. **Silent Fallback to WebView IFrame**:
   ```typescript
   if (Capacitor.isNativePlatform()) {
     const directUrl = await resolveAndroidStream(videoId);
     if (directUrl) {
       return { url: directUrl, engine: 'native' };
     }
     return { url: null, engine: 'youtube' }; // <--- FALLS BACK TO IFRAME!
   }
   ```
4. Once it falls back to `engine: 'youtube'`, `useAudioPlayer.ts` runs:
   ```typescript
   playViaYouTube(currentTrack);
   ```
   The audio is now playing in the WebView iframe, **subject to the exact same mobile background shutdown as the web browser**.

---

## 3. The Architecture Blueprints to Solve Both Platforms

### 3.1 Android APK Solution: Reliable Native Streaming

To ensure the APK **always** plays in the background and on the lock screen, we must ensure `resolveAndroidStream` successfully returns a playable audio stream to `NativeAudio.play()`.

```
┌────────────────────────────────────────────────────────┐
│                      Android APK                       │
├────────────────────────────────────────────────────────┤
│ 1. User selects track                                 │
│ 2. resolveAndroidStream(videoId)                      │
│    ├─ Try ANDROID_VR / ANDROID_TESTSUITE InnerTube    │
│    │  (Returns direct unthrottled googlevideo URL)    │
│    └─ Fallback: Vercel Serverless Audio Gateway       │
│ 3. Pass URL to NativeAudio.play({ url, title, ... })  │
│ 4. PlaybackService.java starts Foreground Service     │
│    ├─ ExoPlayer decodes direct audio                  │
│    ├─ WAKE_MODE_NETWORK keeps CPU alive               │
│    └─ System Notification & Lock-Screen Controls      │
│ 5. RESULT: 100% Uninterrupted Background Audio        │
└────────────────────────────────────────────────────────┘
```

#### Key Steps for Android:
1. **InnerTube Client Profiles**: Use clients that serve unthrottled, unciphered direct audio streams (such as `ANDROID_VR`, `ANDROID_TESTSUITE`, or `WEB_EMBEDDED_PLAYER`).
2. **Cloudflare/Vercel Stream Fallback**: If on-device InnerTube returns a ciphered format, fall back to our serverless stream proxy (`/api/stream/:id`) which descrambles the cipher and streams the audio.
3. **ExoPlayer Takes Precedence**: Ensure `useAudioPlayer.ts` on Android always hands the stream to `NativeAudioPlugin`. `PlaybackService.java` will then keep the CPU awake and show the lock-screen player notification.

---

### 3.2 Mobile Web App Solution: HTML5 Audio + MediaSession

In standard mobile browsers (Chrome / Safari), the YouTube IFrame cannot play in the background. The only way to provide background and lock-screen playback on the web is:

```
┌────────────────────────────────────────────────────────┐
│                   Mobile Web Browser                   │
├────────────────────────────────────────────────────────┤
│ 1. User plays song                                     │
│ 2. Stream resolved via Serverless Gateway              │
│    (/api/stream/:id -> direct audio stream)            │
│ 3. Audio loaded into native HTML5 <audio> element      │
│ 4. navigator.mediaSession metadata & action handlers   │
│    ├─ setActionHandler('play')                         │
│    ├─ setActionHandler('pause')                        │
│    ├─ setActionHandler('previoustrack')                │
│    └─ setActionHandler('nexttrack')                    │
│ 5. RESULT: Mobile browser maintains background audio   │
│    and displays native OS lock-screen player.          │
└────────────────────────────────────────────────────────┘
```

#### Comparison Matrix:

| Surface | Engine | Background Playback? | Lock-Screen Controls? | Root Cause / Enabler |
| :--- | :--- | :---: | :---: | :--- |
| **Mobile Web** | YouTube IFrame | ❌ No | ❌ No | W3C Page Visibility pauses video; browser suspends iframe |
| **Mobile Web** | HTML5 `<audio>` + MediaSession | ✅ Yes | ✅ Yes | Direct audio tag + MediaSession allows background audio |
| **Android APK** | YouTube IFrame (Fallback) | ❌ No | ❌ No | WebView pauses when activity stops; JS timers frozen |
| **Android APK** | Native `PlaybackService` (ExoPlayer) | ✅ Yes | ✅ Yes | Android Foreground Service + `WAKE_MODE_NETWORK` |

---

## 4. Implementation Plan

1. **Fix `src/utils/streamResolver.ts`**:
   - Update `resolveAndroidStream` to use working InnerTube endpoints (`https://www.youtube.com/youtubei/v1/player` with `ANDROID_VR` / `ANDROID_TESTSUITE`).
   - Add Vercel serverless stream proxy fallback (`https://rem-mocha.vercel.app/api/stream/${videoId}`) so that even if YouTube applies a signature cipher, a valid direct stream is provided.
   - For Mobile Web, offer an option or fallback to play via HTML5 `<audio>` when direct/proxied streams are available.

2. **Verify `PlaybackService.java` Notification Lifecycle**:
   - Verify notification channel priority is `NotificationManager.IMPORTANCE_LOW` with `VISIBILITY_PUBLIC` so it renders on the lock screen.
   - Verify `PendingIntent` for next/previous/pause media button actions.

3. **Rebuild and Verify**:
   - Test background playback on minimize and lock screen.
