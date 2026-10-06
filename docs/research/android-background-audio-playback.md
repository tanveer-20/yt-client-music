# Technical Research Report: Continuous Android Background Audio Playback & MediaSession Architecture

**Document Target Path**: `docs/research/android-background-audio-playback.md`  
**Subject**: Primary-Source Technical Investigation into Android OS Background Process Freezing, AOSP Lifecycle Transitions, and Jetpack Media3 `MediaSessionService` Implementation for Seamless Background Playback.

---

## 1. Executive Summary & Root Cause Diagnosis

### 1.1 The Problem Statement
When a user minimizes `yt-client` (presses the Home button or switches to another application), audio playback abruptly stops or stutters and terminates within seconds. If the device screen turns off, the playback freezes immediately. The user expectation is standard music player behavior: audio must continue uninterrupted while the app is backgrounded in phone memory, and playback controls must remain accessible via the lock screen, notification shade, and Bluetooth peripherals.

### 1.2 The Root Cause Audit
Our inspection of the codebase (`NativeAudioPlugin.java`, `MainActivity.java`, `AndroidManifest.xml`, and `android/app/build.gradle`) reveals **four critical architectural failures** causing this shutdown:

1. **Activity-Bound ExoPlayer Instance (No Android Service)**:
   - In `NativeAudioPlugin.java`, `ExoPlayer` is instantiated directly inside the Capacitor plugin class using the `Plugin.getContext()` (the `MainActivity` lifecycle).
   - When the user leaves `yt-client`, the Android framework invokes `MainActivity.onPause()` followed by `MainActivity.onStop()`.
   - In AOSP (Android Open Source Project), an Activity without an associated running `Service` has its process state demoted from `PROCESS_STATE_TOP` to `PROCESS_STATE_CACHED_ACTIVITY` (`IMPORTANCE_CACHED`).

2. **AOSP Linux `cgroup` Freezer (`process_freezer.cpp`)**:
   - Starting in Android 11 and hardened in Android 12/13/14, the Android Activity Manager uses the Linux kernel `cgroup` v2 freezer.
   - As soon as an application enters the cached state without a foreground service, the kernel freezes all user-space threads belonging to the app's PID/UID.
   - ExoPlayer's internal decoding and audio playback thread (`ExoPlayer:Playback`) is immediately frozen at the kernel level. No further PCM buffers are queued to the Android Audio HAL (`AudioTrack`), causing buffer starvation and silence within 20–50 ms.

3. **Undeclared Background Service & Missing Media3 `MediaSessionService`**:
   - While `AndroidManifest.xml` declares `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />` and `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />`, **no `<service>` component is registered** in the manifest.
   - In modern Android (Android 8.0 Oreo through Android 14 UpsideDownCake), background execution limits prohibit an app from streaming network data or holding CPU resources in the background unless it runs an active `ForegroundService` with an ongoing system notification.

4. **Missing CPU & Wi-Fi WakeLocks (`C.WAKE_MODE_NETWORK`)**:
   - `NativeAudioPlugin.java` does not configure `.setWakeMode(C.WAKE_MODE_NETWORK)` on the `ExoPlayer.Builder`.
   - When the screen turns off, the Android kernel powers down the SoC's application processor into deep sleep (Suspend-to-RAM / Doze). Without a `PowerManager.WakeLock` and a `WifiManager.WifiLock`, network packet transmission and audio decoding halt even if the process was not yet killed.

5. **The Fallacy of `webView.resumeTimers()`**:
   - `MainActivity.java` currently contains:
     ```java
     @Override
     public void onPause() {
         super.onPause();
         if (webView != null) webView.resumeTimers();
     }
     ```
   - `webView.resumeTimers()` only instructs the Chromium Blink engine not to pause JavaScript `setTimeout`/`setInterval` clocks while the Activity is paused. It has **zero effect** on Android OS process priority, does not prevent kernel cgroup thread freezing, does not hold a CPU wake lock, and cannot keep native threads running once the OS enters `onStop()`.

---

## 2. Android OS Process Lifecycle & Background Execution Limits

### 2.1 AOSP Process Priority Hierarchy

The Android kernel low-memory killer daemon (`lmkd`) and `ActivityManagerService` classify running processes into priority buckets defined in `android.app.ActivityManager`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ High Priority: PROCESS_STATE_TOP (Foreground Activity)                                 │
│   - App is currently visible on screen; zero restrictions.                             │
└─────────────────────────────────────┬──────────────────────────────────────────────────┘
                                      │ User presses Home / switches apps
                                      ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Elevated Priority: PROCESS_STATE_FOREGROUND_SERVICE (Foreground Service Running)       │
│   - Active Service displaying ongoing Notification (FOREGROUND_SERVICE_MEDIA_PLAYBACK) │
│   - Immune to cgroup freezer. CPU & Network remain active with WakeLock.               │
└─────────────────────────────────────┬──────────────────────────────────────────────────┘
                                      │ If NO Foreground Service exists
                                      ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Frozen / Suspended: PROCESS_STATE_CACHED_ACTIVITY (oom_adj: 900–999)                  │
│   - Subject to Linux cgroup freezer within 0 to 10 seconds.                            │
│   - All threads frozen; network sockets throttled/closed; killed first on memory need. │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Android 14+ (API 34) Foreground Service Type Enforcement
Under Android 14's strict foreground service policies (Primary Source: [developer.android.com/about/versions/14/changes/fgs-types-media-playback](https://developer.android.com/about/versions/14/changes/fgs-types-media-playback)):
- A foreground service that plays audio must explicitly declare `android:foregroundServiceType="mediaPlayback"` in `AndroidManifest.xml`.
- Starting the foreground service requires `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`.
- If an app attempts to start a foreground service without this type or without an ongoing `Notification`, the system throws a `ForegroundServiceStartNotAllowedException` or crashes with `SecurityException`.

### 2.3 Android 13+ (API 33) Notification Permission Requirement
Under Android 13 (API 33) (Primary Source: [developer.android.com/develop/ui/views/notifications/notification-permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)):
- An app must request and receive the runtime permission `android.permission.POST_NOTIFICATIONS`.
- A foreground service requires a visible notification. If the notification cannot be shown because permission was denied or never requested, Android 13/14 treats the foreground service as invalid or suppresses its elevation, exposing it to immediate background termination.

---

## 3. Jetpack Media3 `MediaSessionService` Architecture

### 3.1 Why Media3 Solves Background Playback
In Google's Jetpack Media3 framework, the playback engine is explicitly decoupled from the UI layer:

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ React / Capacitor Web UI (WebView)                                                │
│   - Sends commands via Capacitor Plugin Bridge (play, pause, seek, setTrack)      │
│   - Receives playback events via JavaScript Listeners                             │
└───────────────────────────────▲───────────────────────────────────────────────────┘
                                │ Capacitor Plugin Method / Event Listener
                                ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ NativeAudioPlugin (com.getcapacitor.Plugin)                                       │
│   - Acts as client/controller bridging Capacitor calls to PlaybackService         │
│   - Holds a MediaController connected to MediaSessionService                      │
└───────────────────────────────▲───────────────────────────────────────────────────┘
                                │ Binder IPC / MediaSession Token
                                ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ PlaybackService (extends androidx.media3.session.MediaSessionService)             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │ MediaSession                                                                │  │
│  │   - Exposes Player state to OS, Android Auto, Wear OS, Bluetooth AVRCP      │  │
│  │   - Connected to ExoPlayer                                                  │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │ DefaultMediaNotificationProvider                                            │  │
│  │   - Automatically posts & updates System Media Notification with Artwork    │  │
│  │   - Calls Service.startForeground() on Play, drops on Pause                 │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │ ExoPlayer Engine                                                            │  │
│  │   - 32-bit Float AudioSink (AudioFormat.ENCODING_PCM_FLOAT)                 │  │
│  │   - DynamicsProcessing (MBDRC 4-Band Studio Compressor)                     │  │
│  │   - LoudnessEnhancer (ITU-R BS.1770 -14 LUFS Calibration)                   │  │
│  │   - C.WAKE_MODE_NETWORK (PowerManager Partial WakeLock + WifiLock)          │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Primary-Source Mechanics of `MediaSessionService`
(Primary Sources: `androidx.media3.session.MediaSessionService`, `androidx.media3.session.MediaSession`, `androidx.media3.session.DefaultMediaNotificationProvider`):

1. **Automatic Lifecycle & Foreground Management**:
   - When `player.play()` is invoked and the playback state becomes `STATE_READY` with `playWhenReady = true`, `MediaSessionService` calls `startForeground(NOTIFICATION_ID, notification, FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)`.
   - The OS elevates the process to `PROCESS_STATE_FOREGROUND_SERVICE`.
   - When playback is paused, `MediaSessionService` automatically calls `stopForeground(STOP_FOREGROUND_DETACH)`, keeping the notification visible for user interaction while freeing OS foreground priority.
   - When playback is stopped or the service is destroyed, `stopForeground(STOP_FOREGROUND_REMOVE)` removes the notification.

2. **System UI & Lock Screen Media Player**:
   - Modern Android versions (Android 11 through 15) render a rich system media carousel in the Quick Settings shade and on the Lock Screen.
   - Android extracts this interface directly from the active `MediaSession` token.
   - The system displays the track title, artist name, album, progress seek bar, play/pause toggle, and skip next/previous buttons.

3. **Hardware & Peripheral Integration (Bluetooth / Headset Controls)**:
   - When the user presses the play/pause button on Bluetooth headphones (Sony WH-1000XM, AirPods, Galaxy Buds) or a car dashboard via Bluetooth AVRCP, the Android system routes key events directly to the active `MediaSession`.
   - With `MediaSessionService`, these hardware buttons control `ExoPlayer` automatically even when the phone screen is off and the app UI is completely minimized.

---

## 4. Comprehensive Architectural Gap Analysis

| Feature / Requirement | Current `yt-client` Implementation | Media3 `MediaSessionService` Standard | Impact on Minimizing |
| :--- | :--- | :--- | :--- |
| **Component Context** | `MainActivity` / `Plugin.getContext()` | Background `Service` (`MediaSessionService`) | **FATAL**: Activity is stopped on minimize; process classified as cached. |
| **Process State** | `PROCESS_STATE_CACHED_ACTIVITY` | `PROCESS_STATE_FOREGROUND_SERVICE` | **FATAL**: Kernel cgroup freezer halts audio threads within seconds. |
| **Manifest Service Registration** | None | `<service android:name=".PlaybackService" android:foregroundServiceType="mediaPlayback">` | **FATAL**: Android 14 disallows background execution without registered FGS. |
| **WakeLock Management** | None | `player.setWakeMode(C.WAKE_MODE_NETWORK)` | **FATAL**: Screen off puts SoC into deep sleep, killing network streaming. |
| **System Media Notification** | None | `DefaultMediaNotificationProvider` with `MediaStyle` | **MISSING**: No notification controls on lock screen or status bar. |
| **Bluetooth / Headset Controls** | Web `navigator.mediaSession` (unreliable when WebView paused) | Native `MediaSession` connected to OS Audio Framework | **MISSING**: Earbud buttons fail when app is minimized. |
| **High-Fidelity Audio Preservation** | 32-bit Float, MBDRC, LoudnessEnhancer | Preserved entirely inside `PlaybackService` | Can be seamlessly retained in service architecture. |

---

## 5. Production Implementation Blueprint

### 5.1 Step 1: Add Gradle Dependencies (`android/app/build.gradle`)
Add `media3-session` to match existing Media3 libraries:

```groovy
dependencies {
    // Existing Media3 dependencies
    implementation "androidx.media3:media3-exoplayer:1.3.1"
    implementation "androidx.media3:media3-datasource:1.3.1"
    implementation "androidx.media3:media3-common:1.3.1"
    
    // REQUIRED: Media3 Session for Background Service & Notification management
    implementation "androidx.media3:media3-session:1.3.1"
}
```

### 5.2 Step 2: Register Service & Permissions (`android/app/src/main/AndroidManifest.xml`)

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Permissions for Continuous Background Playback -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <!-- Android 13+ Notification Permission -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application ...>
        
        <!-- Register MediaSessionService -->
        <service
            android:name=".PlaybackService"
            android:exported="true"
            android:foregroundServiceType="mediaPlayback">
            <intent-filter>
                <action android:name="androidx.media3.session.MediaSessionService" />
            </intent-filter>
        </service>

        <activity android:name=".MainActivity" ... />
    </application>
</manifest>
```

### 5.3 Step 3: Implement `PlaybackService.java`
Create `android/app/src/main/java/com/ytmusic/app/PlaybackService.java` extending `androidx.media3.session.MediaSessionService`.

Key architectural elements:
1. Host the `ExoPlayer` instance configured with:
   - `C.WAKE_MODE_NETWORK` to prevent CPU/Wi-Fi sleep.
   - `AudioAttributes` (`USAGE_MEDIA`, `CONTENT_TYPE_MUSIC`, `handleAudioFocus = true`).
   - 32-bit floating-point audio sink (`DefaultAudioSink.Builder.setEnableFloatOutput(true)`).
   - 200MB LRU disk cache (`SimpleCache`).
2. Attach the studio DSP engine (`DynamicsProcessing` 4-band MBDRC and `LoudnessEnhancer`) in `Player.Listener.onPlaybackStateChanged`.
3. Construct `MediaSession.Builder(this, player).setCallback(...)` and return the session in `onGetSession(MediaSession.ControllerInfo)`.
4. Provide custom action callbacks for next/previous track events routed to the Capacitor layer or internal queue.

```java
package com.ytmusic.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.io.File;

public class PlaybackService extends MediaSessionService {
    private static final String TAG = "PlaybackService";
    private ExoPlayer player;
    private MediaSession mediaSession;
    private static SimpleCache simpleCache;

    @Override
    public void onCreate() {
        super.onCreate();
        initCache();
        initPlayer();
        initMediaSession();
    }

    private synchronized void initCache() {
        if (simpleCache == null) {
            try {
                File cacheDir = new File(getCacheDir(), "media3_audio_cache");
                LeastRecentlyUsedCacheEvictor evictor = new LeastRecentlyUsedCacheEvictor(200 * 1024 * 1024);
                simpleCache = new SimpleCache(cacheDir, evictor);
            } catch (Exception e) {
                Log.w(TAG, "Cache init failed: " + e.getMessage());
            }
        }
    }

    private void initPlayer() {
        DefaultAudioSink audioSink = new DefaultAudioSink.Builder(this)
                .setEnableFloatOutput(true)
                .build();

        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(this)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER);

        DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("Mozilla/5.0 (Linux; Android 14) ExoPlayer")
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(15000)
                .setAllowCrossProtocolRedirects(true);

        DefaultMediaSourceFactory mediaSourceFactory;
        if (simpleCache != null) {
            CacheDataSource.Factory cacheDataSourceFactory = new CacheDataSource.Factory()
                    .setCache(simpleCache)
                    .setUpstreamDataSourceFactory(httpDataSourceFactory)
                    .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
            mediaSourceFactory = new DefaultMediaSourceFactory(cacheDataSourceFactory);
        } else {
            mediaSourceFactory = new DefaultMediaSourceFactory(httpDataSourceFactory);
        }

        player = new ExoPlayer.Builder(this, renderersFactory)
                .setMediaSourceFactory(mediaSourceFactory)
                .setWakeMode(C.WAKE_MODE_NETWORK) // CRITICAL: Keeps CPU & Wi-Fi active in background
                .setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                                .setUsage(C.USAGE_MEDIA)
                                .build(),
                        true // Automatic Audio Focus
                )
                .build();
    }

    private void initMediaSession() {
        Intent sessionActivityIntent = new Intent(this, MainActivity.class);
        PendingIntent sessionActivityPendingIntent = PendingIntent.getActivity(
                this, 0, sessionActivityIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        mediaSession = new MediaSession.Builder(this, player)
                .setSessionActivity(sessionActivityPendingIntent)
                .build();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
```

### 5.4 Step 4: Refactor `NativeAudioPlugin.java` to Bridge to `PlaybackService`
`NativeAudioPlugin` connects to `PlaybackService` using `MediaController`:
- When initialized, builds a `MediaController` asynchronously with `SessionToken(context, new ComponentName(context, PlaybackService.class))`.
- When `play({ url, title, artist, artworkUrl, loudnessDb })` is called from TypeScript, constructs a Media3 `MediaItem` with metadata:
  ```java
  MediaMetadata metadata = new MediaMetadata.Builder()
          .setTitle(title)
          .setArtist(artist)
          .setArtworkUri(artworkUrl != null ? Uri.parse(artworkUrl) : null)
          .build();

  MediaItem item = new MediaItem.Builder()
          .setUri(Uri.parse(url))
          .setMediaMetadata(metadata)
          .build();
  ```
- This metadata automatically feeds Android's System Media Controls and Lockscreen Notification.
- Event listeners for `onMediaItemTransition`, `onIsPlayingChanged`, and `onPlaybackStateChanged` broadcast back to React/Zustand via Capacitor `notifyListeners("stateChange", ...)`.

### 5.5 Step 5: TypeScript & React Integration (`src/hooks/useAudioPlayer.ts`)
Pass metadata payload during `NativeAudio.play()`:

```typescript
if (Capacitor.isNativePlatform()) {
  activeModeRef.current = 'native';
  NativeAudio.play({
    url: streamUrl,
    title: currentTrack.title,
    artist: currentTrack.artist,
    artworkUrl: currentTrack.thumbnail,
    loudnessDb: (currentTrack as any).loudnessDb ?? 0,
  });
}
```

---

## 6. OEM Aggressive Killer Mitigations ("Don't Kill My App")

Certain Android OEM skins (Xiaomi HyperOS / MIUI, Samsung One UI, Oppo/Realme ColorOS, Huawei EMUI) employ aggressive proprietary background daemons (e.g. `miui-powerkeeper`, Samsung Device Care) that terminate even valid foreground services if an app is left in the background for prolonged periods.

To achieve 100% uninterrupted playback on all consumer devices:
1. **Battery Optimization Exemption**:
   - Guide the user or invoke `android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` so the app is placed in "Unrestricted" battery mode.
2. **Auto-Start & Background Launch Permissions**:
   - On Xiaomi devices, prompt user to enable "Autostart" and "Run in background".
3. **Notification Channel Priority**:
   - Ensure the notification channel created by `DefaultMediaNotificationProvider` has `NotificationManager.IMPORTANCE_LOW` (standard for media playback to avoid audible dinging while retaining foreground service immunity).

---

## 7. Primary Source Citations & References

1. **Android Developers — Media3 Background Playback**:  
   [https://developer.android.com/media/media3/session/background-playback](https://developer.android.com/media/media3/session/background-playback)
2. **Android Developers — Foreground Service Types: Media Playback (Android 14 API 34)**:  
   [https://developer.android.com/about/versions/14/changes/fgs-types-media-playback](https://developer.android.com/about/versions/14/changes/fgs-types-media-playback)
3. **Android Developers — Notification Runtime Permissions (Android 13 API 33)**:  
   [https://developer.android.com/develop/ui/views/notifications/notification-permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)
4. **AndroidX Media3 GitHub Repository — `MediaSessionService.java` Source Code**:  
   [https://github.com/androidx/media/tree/release/libraries/session](https://github.com/androidx/media/tree/release/libraries/session)
5. **AOSP — Android Linux cgroup Process Freezer Architecture (`process_freezer.cpp`)**:  
   [https://source.android.com/devices/tech/perf/cached-apps-freezer](https://source.android.com/devices/tech/perf/cached-apps-freezer)
6. **Android Audio HAL & AudioTrack Offload Documentation**:  
   [https://source.android.com/devices/audio/implement](https://source.android.com/devices/audio/implement)
