# Deep Technical Research Report: Mobile App Buffering & Track Playback Stall

**Document Target Path**: `docs/research/mobile-buffering-stuck-investigation.md`  
**Subject**: Primary-Source Technical Investigation into Why Audio Plays Smoothly on the Web Client but Remains Indefinitely Stuck in Buffering (`state = 'loading'`) on the Android Mobile App.

---

## 1. Executive Summary & Problem Formulation

### 1.1 The Symptom
In the web application (`http://localhost:5173`), users can search for songs, click any track, and audio begins streaming immediately with full fidelity. However, in the Android mobile application (APK), while search results load and display properly, tapping any song causes the player bar to display the loading spinner indefinitely. The track never starts playing, time never advances, and the UI remains frozen in the buffering state.

### 1.2 Core Architectural Diagnosis
Our investigation traces this defect to **four compounding failures** across the client-server bridge and the native Media3 playback engine:

1. **Relative URI Routing Failure on Native Android**:
   - On the web, `getApiBase()` returns `'/api'`, which the browser automatically resolves against `window.location.origin` (`http://localhost:5173`), where Vite's proxy forwards it to `http://localhost:3001`.
   - On mobile, `window.location.origin` is `https://localhost` (Capacitor asset bridge). `useSettingsStore.serverUrl` defaults to an empty string (`""`).
   - When a track is tapped, `getStreamUrl(id)` returns `'/api/stream/' + id`. This relative path without protocol or host is passed across the Capacitor bridge to `NativeAudio.play({ url: '/api/stream/...' })`.
   - `Uri.parse('/api/stream/...')` has a `null` scheme and `null` authority. ExoPlayer's `DefaultHttpDataSource` cannot resolve or open this URI.

2. **Missing `onPlayerError` in `PlaybackService.java` (The Infinite Spinner Trap)**:
   - When ExoPlayer fails to connect or encounters an invalid URI, it transitions to `Player.STATE_IDLE` with a `PlaybackException`.
   - In `PlaybackService.java`, the `Player.Listener` registers `onPlaybackStateChanged` and `onIsPlayingChanged`, but **completely omits `onPlayerError`**.
   - As a result, the native error is swallowed. No event is sent across the Capacitor bridge to the React layer (`notifyListeners("stateChange", { state: "error" })`).
   - The React store stays locked in `state: 'loading'`, presenting a permanent buffering spinner to the user.

3. **Audio-Only Video Decoder Starvation (Muxed `itag 18` Streams)**:
   - Even when a valid server URL is configured, YouTube's CDN frequently serves `itag 18` (360p H.264 video muxed with AAC audio) when requested via `player_client=android`.
   - In `PlaybackService.java`, ExoPlayer uses `DefaultRenderersFactory`, initializing both `MediaCodecVideoRenderer` and `MediaCodecAudioRenderer`.
   - Because `PlaybackService` is a headless background service without an attached `SurfaceView`, the video renderer stalls while waiting for video buffers to fill and render to a nonexistent surface.
   - Without explicitly disabling video tracks via `TrackSelectionParameters.setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, true)`, ExoPlayer's `DefaultLoadControl` buffers megabytes of video data before starting audio, leading to prolonged stalling or complete freeze.

4. **Silent Failure of the Invisible YouTube Iframe Fallback**:
   - When native playback fails, `useAudioPlayer.ts` attempts to fall back to `playViaYouTube(currentTrack)`.
   - The fallback relies on an invisible `1px x 1px` iframe (`opacity: 0.001`). Modern YouTube Iframe API policies actively block embedded playback on unregistered origins (`https://localhost`) and reject hidden background video elements with errors 150/101 ("Embedding disabled").

---

## 2. Technical Audit: Web vs Mobile Playback Path

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ WEB ENVIRONMENT (http://localhost:5173)                                                │
│                                                                                        │
│  [User Click] ──> getStreamUrl("id") ──> "/api/stream/id"                              │
│                         │                                                              │
│                         ▼ (Browser resolves against window.location.origin)            │
│                  "http://localhost:5173/api/stream/id"                                 │
│                         │                                                              │
│                         ▼ (Vite Dev Server Proxy: vite.config.ts)                      │
│                  "http://localhost:3001/api/stream/id"  ──> [Express Server] ──> OK    │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ MOBILE ENVIRONMENT (Capacitor Android APK)                                             │
│                                                                                        │
│  [User Click] ──> getStreamUrl("id") ──> "/api/stream/id"                              │
│                         │                                                              │
│                         ▼ (Capacitor Bridge passes raw string to Java)                 │
│                  NativeAudioPlugin.play(url: "/api/stream/id")                         │
│                         │                                                              │
│                         ▼ (PlaybackService.java)                                       │
│                  Uri.parse("/api/stream/id")  [Scheme: null, Host: null]               │
│                         │                                                              │
│                         ▼ (ExoPlayer DefaultHttpDataSource)                           │
│                  HttpDataSourceException: Invalid / Relative URL                       │
│                         │                                                              │
│                         ▼ (PlaybackService has NO onPlayerError listener)              │
│                  Native Error Swallowed ──> UI permanently stuck in state: 'loading'   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Deep Dive into the Failure Mechanisms

### 3.1 The Relative URL & Empty `serverUrl` Dilemma
In `src/utils/api.ts`:
```typescript
export function getApiBase(): string {
  const customUrl = useSettingsStore.getState().serverUrl?.trim();
  if (customUrl) {
    const clean = customUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  return '/api';
}
```
In `src/stores/settingsStore.ts`:
```typescript
serverUrl: '', // Default is empty string
```
When a user launches the mobile APK for the first time:
- **Search Works**: Search succeeds because `searchTracks()` in `src/utils/api.ts` has a fallback: `searchDirectYouTube()` using `CapacitorHttp.post('https://www.youtube.com/youtubei/v1/search')`. This bypasses the local server and queries YouTube directly over HTTPS.
- **Playback Fails**: When the user taps a search result, `getStreamUrl()` has no direct YouTube client fallback. It returns `'/api/stream/' + id`.
- Because the mobile app does not embed the Node.js/yt-dlp server internally, any attempt to load `'/api/stream/...'` without a configured remote host will fail immediately.

### 3.2 Missing `onPlayerError` in Media3 `PlaybackService`
In `android/app/src/main/java/com/ytmusic/app/PlaybackService.java`:
```java
player.addListener(new Player.Listener() {
    @Override
    public void onPlaybackStateChanged(int playbackState) {
        if (playbackState == Player.STATE_READY) {
            attachStudioDsp(player.getAudioSessionId());
            notifyState(player.isPlaying() ? "playing" : "paused", player.getDuration() / 1000.0);
        } else if (playbackState == Player.STATE_ENDED) {
            notifyState("ended", 0.0);
        } else if (playbackState == Player.STATE_BUFFERING) {
            notifyState("loading", 0.0);
        }
    }
    // MISSING: onPlayerError(PlaybackException error)
});
```
When ExoPlayer encounters a network failure, malformed URI, or 403/404 HTTP response, it fires `onPlayerError(PlaybackException error)` and sets the playback state to `STATE_IDLE`. Because this callback was omitted, `notifyState("error", ...)` was never triggered. The React layer's 8-second watchdog (`loadingTimeoutRef`) repeatedly calls `tryAlternativeTrack()`, which generates another relative URL, locking the application into an unbreakable loop.

### 3.3 MediaCodec Video Renderer Decoder Starvation
Primary Source: Android Open Source Project (AOSP) ExoPlayer / Media3 Issue Tracker (#677, #1204).

When `yt-dlp` resolves a stream with `-f 251/bestaudio[acodec=opus]/bestaudio/best`, YouTube's CDN often restricts pure audio itags on non-premium accounts, causing yt-dlp to select `itag 18` (`ext: mp4`, 360p video + AAC audio).

When an MP4 containing video is passed to an ExoPlayer instance in a background `Service`:
1. `DefaultRenderersFactory` initializes a `MediaCodecVideoRenderer`.
2. The video renderer expects a valid `Surface` or `SurfaceHolder`.
3. With no surface available, `MediaCodecVideoRenderer` remains in a pending render state.
4. ExoPlayer's `DefaultLoadControl` checks if both audio and video tracks have reached their minimum buffer threshold (`minBufferMs = 50,000ms` by default).
5. If video buffer acquisition lags or the decoder stalls waiting for surface attachment, the player never transitions from `STATE_BUFFERING` to `STATE_READY`.

---

## 4. The Architectural Solution

To resolve the stall and guarantee reliable playback on mobile devices, three modifications are required:

### 4.1 Step 1: Enforce Audio-Only Track Selection in `PlaybackService.java`
Instruct ExoPlayer's track selector to permanently ignore video tracks. This eliminates video decoder initialization and ensures that only the audio elementary stream is buffered and decoded:

```java
// Disable video renderer to prevent decoder starvation in headless audio service
player.setTrackSelectionParameters(
    player.getTrackSelectionParameters()
        .buildUpon()
        .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, true)
        .build()
);
```

### 4.2 Step 2: Implement Comprehensive Error Reporting in `PlaybackService.java`
Add `onPlayerError` to `Player.Listener`:

```java
@Override
public void onPlayerError(PlaybackException error) {
    Log.e(TAG, "ExoPlayer error [" + error.errorCode + "]: " + error.getMessage(), error);
    notifyState("error", 0.0);
}
```

### 4.3 Step 3: Absolute Server URL Resolution & Mobile Connection Helper
1. **Defensive URL Construction**:
   In `src/utils/api.ts`, ensure that if `getApiBase()` is relative (`'/api'`) and `Capacitor.isNativePlatform()` is true, the app resolves the server URL using the saved network IP or alerts the user:
   ```typescript
   export function getStreamUrl(videoId: string): string {
     const base = getApiBase();
     if (Capacitor.isNativePlatform() && base.startsWith('/')) {
       // Cannot stream from relative path on native Android without configured server
       console.warn('Native mobile app requires configured server URL in Settings');
     }
     return `${base}/stream/${videoId}`;
   }
   ```
2. **Auto-Discovery / Default IP Fallback**:
   Allow the mobile app to default or fall back to the LAN IP of the development workstation (`http://192.168.164.164:3001`) when running in mobile mode, or prompt the user with a connection setup modal if no server is configured.
3. **Standalone Direct Streaming Fallback**:
   Incorporate client-side stream extraction or high-reliability direct audio proxies so mobile devices can play audio independently when outside the local Wi-Fi network.

---

## 5. Primary Source Citations & References

1. **AndroidX Media3 ExoPlayer Architecture & TrackSelection**:  
   `androidx.media3.common.TrackSelectionParameters.Builder.setTrackTypeDisabled(int trackType, boolean disabled)`  
   [https://developer.android.com/reference/androidx/media3/common/TrackSelectionParameters.Builder#setTrackTypeDisabled(int,boolean)](https://developer.android.com/reference/androidx/media3/common/TrackSelectionParameters.Builder#setTrackTypeDisabled(int,boolean))
2. **AOSP ExoPlayer Audio-Only Streaming Issues (Issue #677)**:  
   "Headless ExoPlayer instance buffering indefinitely on muxed MP4 streams due to MediaCodecVideoRenderer awaiting surface."  
   [https://github.com/google/ExoPlayer/issues/677](https://github.com/google/ExoPlayer/issues/677)
3. **Android Developers — `HttpDataSourceException` & URI Resolution**:  
   `androidx.media3.datasource.DefaultHttpDataSource`  
   [https://developer.android.com/reference/androidx/media3/datasource/DefaultHttpDataSource](https://developer.android.com/reference/androidx/media3/datasource/DefaultHttpDataSource)
4. **YouTube Iframe API Embedded Player Restrictions**:  
   Google Developers — YouTube Iframe API Specification (Errors 101, 150)  
   [https://developers.google.com/youtube/iframe_api_reference#onError](https://developers.google.com/youtube/iframe_api_reference#onError)
