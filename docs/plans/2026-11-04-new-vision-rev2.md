# New Vision — Rem Personal Music Client

**Status:** Final plan for sign-off
**Date:** 2026-11-04 (Revision 2; original 2026-11-03)
**Scope:** One user, Android phone + Windows laptop; the laptop is not guaranteed to be on
**Goal:** Spotify/Apple Music-level convenience and reliability on the phone; the best free, zero-backend playback achievable in a browser on Windows; no manually-run backend, no paid services
**Implementation branch:** `rebuild/v2-playback` (created only after sign-off; no commits before approval)

**What changed in Revision 2:**

- The **Windows desktop (Electron) app is removed from scope**. Windows is served by the web app running in Chrome/Edge.
- The former laptop reliability path (Electron + bundled `yt-dlp` sidecar + localhost proxy) is replaced by an **in-browser resolver chain**: a small one-time-loaded Chrome/Edge **extension bridge** that enables fully client-side resolution (adopted from proven open source: `ytc-bridge` + `Kira` + `YouTube.js` + `bgutils-js`), with a **rotating public-Invidious byte-proxy fallback** (adopted from ytify's architecture).
- Evidence: a 2026-11-04 field-research pass (§3.11) found both paths working in live open-source projects; the Phase 0 spike becomes adopt-and-verify, not invent.

---

## 1. Executive decision

Build **one React UI** and ship it on **two surfaces**, with a clear reliability split:

| Surface | Playback engine | Backend required | v1 reliability target |
|---|---|---|---|
| **Android APK** | Native Kotlin: NewPipeExtractor **or** InnerTubeX + Media3 `MediaSessionService` | None | **Spotify-level** |
| **Web PWA — Windows laptop (Chrome/Edge)** | `WebPlaybackAdapter`: HTML5 audio / SABR streaming; resolver chain: (1) extension-bridged client-side InnerTube + in-page PO tokens, (2) public-Invidious byte-proxy rotation | None; one-time unpacked extension | **Browser-app-grade**: Windows media flyout, media keys, minimized-tab audio; resolution = Tier-1 primary with labeled Tier-2 fallback |
| **Web PWA — mobile browser** | Same `WebPlaybackAdapter`, surface-aware | None; optional home relay | **Library/search shell; playback best-effort and explicitly labeled; the APK is the mobile reliability guarantee** |

**The APK is the mobile reliability guarantee. On Windows the browser + extension is the best free path that satisfies the same-IP rule without running anything. The PWA on a phone cannot be free, zero-backend, and Spotify-reliable. That is a platform constraint, not a code defect.**

**Hard rules:**

- No YouTube iframe playback.
- No Vercel/Cloudflare/any stream proxy as the resolver.
- No Piped dependency.
- No silent engine switching.
- No pre-warmed placeholder notification.
- No paid APIs and no private API-key pools (ytify's RapidAPI gate is explicitly not copied).
- If a stream cannot be resolved, show a clear error with Retry/Skip and log the resolver tier.
- No desktop shell of any kind (Electron/Tauri) in this scope. Windows playback lives in the browser.

---

## 2. Constraints, definitions, and success

### 2.1 Hard constraints

- One user; no accounts, no multi-user, no sharing, no userbase.
- Android phone + Windows laptop; the laptop is not guaranteed to be on.
- Free software and free hosting; no paid APIs, no paid VPS, no paid stream proxy.
- **No user-run backend**: no terminal, no "start the server first," no docker containers the user must operate, no always-on laptop process.
- Background playback and lockscreen/notification controls must work on Android without the UI being open.
- No silent degradation to the YouTube iframe.
- Fresh start in a new branch; no commits until this plan is approved.
- On Windows, the only user-facing install besides the browser is **one unpacked Chrome/Edge extension** loaded via developer mode.

### 2.2 Terms used in this plan

- **User-run backend**: a service the user must manually start or keep alive (Express, docker compose, a Pi). Not allowed in v1.
- **Extension bridge**: a small unpacked Chrome/Edge extension that carries the page's `fetch()` calls through the extension background and stamps YouTube-valid request `origin` via `declarativeNetRequest` session rules (the `ytc-bridge` pattern). It is not a user-run server; it is loaded once and forgotten.
- **Hosted service**: a free serverless endpoint used for search/metadata (optional Vercel). Not a playback backend.
- **Resolver tier**: an ordered attempt to obtain a stream for the same playback engine. Tiers are logged and visible; they never switch the audio engine.
- **Byte-proxy**: a server (e.g., a public Invidious instance with `local=true`) that downloads the audio itself and re-serves it with CORS headers. Proven working from a residential browser on 2026-11-03 (HTTP 206 + `Content-Range`).
- **Best-effort**: works when the underlying server/instance permits it, with a visible label and no reliability guarantee.

### 2.3 Success definition for v1

**Android P0 (must pass on a physical phone):**

- Play a track, lock the screen for 60 minutes; audio continues through track transitions.
- Notification shows correct title, artist, album, artwork, and duration.
- Play/pause/next/previous/seek work from the notification, lockscreen, wired headset, and Bluetooth.
- The WebView can be reloaded or killed while native playback continues; reopening the app rehydrates from the native snapshot.
- Pause >10 minutes, then resume from a headset/Bluetooth control.
- No dual audio; no iframe; no Piped.
- A resolver failure produces a visible error with Retry/Skip, not an infinite spinner.

**Windows web P0 (must pass in Chrome and Edge on the laptop):**

- Play, pause, seek, next/previous, volume, queue in the browser.
- The Windows media flyout and keyboard media keys work with correct site identity, artwork, and timeline while the browser is alive.
- Minimizing the tab/browser keeps audio and queue transitions running.
- Closing the browser stops audio — documented as browser-owned lifecycle, not a defect.
- With the extension loaded: Tier-1 client-side resolution passes the 20-track set at ≥90% end-to-end, with the tier visible in the UI.
- Without the extension: Tier-2 Invidious rotation is labeled best-effort in the UI, rotates on dead instances, times out in 3–5 s, and never spins forever.
- No iframe; no Piped; no terminal; no manually started server.

**Web P0 (mobile browser):**

- Same UI, library, playlists, history, and search.
- Mobile playback is best-effort (manual toggle + relay if configured) and clearly labeled, with guidance to use the APK.
- No iframe; no Vercel stream calls; no Piped calls.
- Offline app shell and cached library work.

### 2.4 Non-goals for v1

- iOS.
- A Windows desktop app (Electron/Tauri or any installable shell), tray integration, installers.
- Multi-user accounts or social features.
- Real-time cross-device sync (export/import first).
- Gapless/crossfade as a universal v1 gate (format-dependent; polish later).
- Android Auto, widgets, lyrics, recommendation ML (later).
- Public distribution (until the licensing decision in §13).

---

## 3. What the research proved

### 3.1 Stream URLs are IP-bound

A `googlevideo.com` URL resolved by one machine is rejected when fetched from a different IP. In a live test on 2026-11-03, a public Invidious instance's direct URL returned **HTTP 403** from a residential client, while the same instance's `local=true` proxy returned **HTTP 206** with `Access-Control-Allow-Origin: *` and a valid `Content-Range` for AAC and Opus.

**Consequence:** a remote resolver cannot hand a stream URL to your machine. Either the resolver proxies the bytes from its own IP (Invidious `local=true`), or the resolution itself must happen on the same machine that plays the bytes (native app, or in-browser behind an extension bridge).

### 3.2 YouTube blocks datacenter egress

The block is structural, not a config problem. yt-dlp maintainers state that once an IP is blocked, PO tokens do not fix it. The repo's own ADR-0001 records `LOGIN_REQUIRED`/`UNPLAYABLE` across Vercel's clients. Switching free serverless providers does not change the IP reputation.

**Consequence:** no free serverless provider can be the resolver or byte source. Static hosting and search endpoints are fine; stream bytes are not.

### 3.3 Public Invidious instances alone are not a platform

On 2026-11-03, the official instance list had 10 entries, only 4 clearnet, and exactly **one** with the API enabled. Instance count has collapsed further in 2026 (the loss-of-network is structural), consistent with ytify hard-coding only four instances.

**Consequence:** public instances are a fallback tier with rotation and labels — never the primary guarantee.

### 3.4 The YouTube iframe cannot be the playback core

The iframe is cross-origin. The top-level page cannot own its MediaSession, metadata, or notification. Chrome for Developers: "Media Session calls will affect media notifications only if they come from the same frame as the media resource." Mobile browsers suspend the iframe when backgrounded; API policies prohibit isolating audio and background players.

**Consequence:** the iframe is removed from the playback core everywhere.

### 3.5 Same-origin HTML5 audio is browser-grade, not app-grade

A top-level `<audio>` element with `navigator.mediaSession` can background-play and own media controls while the browser process is alive. It cannot survive the browser being killed, and the browser owns the lifecycle/notification. On Windows this is acceptable behavior; on Android it is not the guarantee.

**Consequence:** HTML5 audio is the Windows-web engine. The Android reliability guarantee is native.

### 3.6 Android native is the only Spotify-level path on the phone

Media3 `MediaSessionService` + ExoPlayer + a native queue + `MediaSession`/`MediaButtonReceiver` + `onPlaybackResumption()` gives a foreground service, MediaStyle notification, lockscreen/Bluetooth controls, audio focus, and resumption. The current service does the opposite: a manually built notification, a single `MediaItem`, and next/previous routed through JavaScript.

**Consequence:** native owns the queue, player, notification, and transport commands. The WebView is a thin controller and a projection of native state.

### 3.7 Capacitor does not keep JavaScript alive

Capacitor is a WebView shell, not a background runtime. The WebView can be paused, reloaded, or killed; the native `MediaSessionService` continues. The plugin must use `MediaController` (not a static service reference), and the UI must call `getSnapshot()`/`getQueue()` on resume.

### 3.8 Chromium-on-Windows media integration is good enough for web scope

Chromium on Windows bridges `navigator.mediaSession` to the Windows SMTC (media flyout and media keys) while the browser lives, with the site's identity, artwork, and timeline. Revision 1's Electron findings (AUMID, dynwinrt, tray) are archived with rev 1 and out of scope: with no desktop app, the browser is the shell, and "resilience beyond browser death" is explicitly not a v1 promise on Windows.

**Consequence:** Windows v1 = browser-grade controls + best-achievable resolution. No native SMTC work, no packaging work.

### 3.9 The extraction ecosystem is an arms race

NewPipeExtractor and yt-dlp lean on a small set of InnerTube clients; PO tokens are video-bound; SABR/UMP is spreading; client versions age out. The YouTube.js/googlevideo stack (LuanRT) is actively maintained (docs updated 2026-10-20) and covers modern SABR/UMP. Every third-party client breaks periodically.

**Consequence:** all extractors stay swappable, run a Phase 0 bake-off (Android) and adopt-and-verify (web), keep a startup canary, and budget maintenance time.

### 3.10 The honest mobile-web conclusion

There is no free, zero-backend, Spotify-reliable path for a standalone mobile browser PWA in 2026:

- Same-origin HTML5 audio can background-play and own MediaSession, but the page cannot resolve a stream itself, and a remote resolver's URL is IP-bound to that resolver.
- Public Invidious can proxy bytes with CORS (works — tested), but instance health is a lottery.
- The only reliable zero-backend mobile path is on-device resolution = the native APK.
- The only reliable remote path is a residential home relay (Pi/NAS + Tailscale/Cloudflare Tunnel), which is an always-on device by definition and out of the zero-backend promise.

**Decision (unchanged in rev 2):** the APK carries the mobile reliability guarantee; mobile PWA is a library/search shell with clearly labeled best-effort playback and an optional home relay escape hatch.

### 3.11 Second field-research pass — what open source already does in the browser (added 2026-11-04)

A fresh pass over live repositories (all claims verified against each project's own code/docs/releases):

| Project | Status (2026) | What it proves |
|---|---|---|
| **ytify** (`n-ce/ytify`, last commit 2026-11-01, GPL-3.0) | Working web app | Resolves via public Invidious `/api/v1/videos` with a shaded 4-instance rotation list; for music ("‑ Topic") tracks it rewrites the origin to the resolving instance = **byte-proxy** (the verified working path); falls back to a Netlify edge function fronting RapidAPI keys — the private-key-pool last resort we will **not** copy |
| **Kira** (`LuanRT/kira`, MIT) + **ytc-bridge** (`LuanRT/ytc-bridge`, MIT, v1.2.0) | Working reference | The **extension-bridge pattern**: the extension never resolves; it relays the page's `fetch()` and stamps `origin: https://www.youtube.com` via `declarativeNetRequest` session rules. The page then resolves **client-side on its own IP** using `youtubei.js`, mints PO tokens **in-page** via `bgutils-js` (BotGuard challenge → integrity token → cold-start token bound to the video), and streams **SABR/UMP** from googlevideo directly (Shaka custom scheme, googlevideo lib) |
| **YouTube.js** (`LuanRT/YouTube.js`, 5.4k★) | Actively maintained (docs updated 2026-10-20) | Officially supports modern browsers with the caveat that full in-browser use needs a proxy or an extension-like bridge — exactly the two tiers planned here |
| **Invidious + invidious-companion** (released v2.20261103.0) | Very active | Public instances work because each instance's companion (Deno, youtubei.js-based) does sessions/PO-token attestation server-side and the instance byte-proxies with `local=true` |
| **Beatbump (original)** | Archived 2025-10-03, "YouTube changes" | Cautionary tale: pure Cloudflare-worker YTM API wrapper is dead |
| **Beatbump (giwty continuation)** | Alive (2026-06-09) | Self-hosted docker (SvelteKit + Go + invidious-companion) — works but violates zero-ops |
| **Hyperpipe** | Discontinued 2025-07-14 | Piped-based frontends are dead ends |
| **Materialious** | v1.18.13 merged 2026-11-02 | Healthiest Invidious frontend; its own table says the **web** build needs a companion URL/reverse-proxy — no free web-only zero-infra path there either |

**Consequence:** the two tiers planned for the Windows web app are not inventions — both are running in maintained open-source projects today. The Phase 0 web spike adopts their architecture and verifies it on our codebase: **Tier 1 = Kira/ytc-bridge-style extension bridge + client-side resolution + in-page PO tokens (progressive audio formats preferred; SABR/UMP audio via the googlevideo lib as the modern path); Tier 2 = ytify-style instance rotation with byte-proxy for music tracks.** Beyond that, the space confirms the boundary: a pure PWA with literally nothing installed still has no path better than the Invidious lottery.

---

## 4. Target architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Shared React UI + domain                  │
│  search · library · queue · now playing · settings · themes   │
│  PlaybackPort · SearchPort · LibraryPort · ResolverPort       │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
   ┌───────────▼─────────────┐  ┌──────────▼─────────────────────────────┐
   │ Android (Capacitor)     │  │ Web PWA — same build (Windows + mobile) │
   │ Native playback         │  │ HTML5 audio / SABR streams              │
   │ NPE or InnerTubeX       │  │ ResolverChain:                          │
   │ Media3 MediaSession     │  │  1. extension-bridged client-side       │
   │                         │  │     InnerTube + bgutils PO + SABR       │
   │                         │  │     (Chrome/Edge + ytc-bridge pattern)  │
   │                         │  │  2. public Invidious rotation           │
   │                         │  │     byte-proxy for music tracks         │
   │                         │  │  3. visible error (Retry/Skip)          │
   │                         │  │  No iframe. No silent fallback.         │
   └─────────────┬───────────┘  └──────────┬─────────────────────────────┘
                 │                          │
            phA phone relies on the APK;    optional home relay = the only
            mobile PWA is labeled           reliable mobile-web path
            best-effort + guidance
```

### 4.1 One UI, two adapters

The React app never talks to an audio engine directly. It talks to a `PlaybackPort`:

```ts
interface PlaybackPort {
  setQueue(items: Track[], startIndex: number, position?: number): Promise<void>;
  getQueue(): Promise<{ items: Track[]; index: number; revision: number }>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(position: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  addToQueue(items: Track[], position?: 'end' | 'next'): Promise<void>;
  removeFromQueue(ids: string[]): Promise<void>;
  moveInQueue(from: number, to: number): Promise<void>;
  clearQueue(keepCurrent?: boolean): Promise<void>;
  getSnapshot(): Promise<PlaybackSnapshot>;
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void;
}
```

`PlaybackSnapshot` is the single source of truth for UI:

```ts
type PlaybackSnapshot = {
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  currentTrackId: string | null;
  index: number;
  position: number;
  duration: number;
  repeat: RepeatMode;
  shuffle: boolean;
  queueRevision: number;
  resolverTier: 'bridge' | 'invidious' | null // rev 2: tier is visible in UI
  error?: {
    code:
      | 'SABR_REQUIRED'
      | 'PO_TOKEN_REQUIRED'
      | 'LOGIN_REQUIRED'
      | 'GEO_BLOCKED'
      | 'RATE_LIMITED'
      | 'URL_EXPIRED'
      | 'NETWORK'
      | 'DECODE'
      | 'EXTRACTOR'
      | 'UNKNOWN';
    message: string;
    retryable: boolean;
    trackId: string;
  };
  revision: number;
};
```

Adapters:

- `NativePlaybackAdapter` — Android Capacitor plugin; native service owns queue/player.
- `WebPlaybackAdapter` — browser HTML5 audio (or SABR-backed stream); surface-aware `ResolverChain`; used on Windows laptop and mobile; no native service.

Rules:

- The UI sends **commands**; it does not mirror state into the engine on every render.
- The engine emits **events**; the Zustand store is a projection.
- One engine is active per surface. Resolver tiers may vary, but they never switch the audio engine.
- Every command carries a `requestId`; stale resolutions are ignored.
- If resolution fails, emit an error; do not auto-switch to another engine.
- The active resolver tier and the last-tier-degradation reason are visible in Settings and in the Now Playing error state.

---

## 5. Android APK — the reliability guarantee

### 5.1 Phase 0 extractor bake-off (decision gate)

Do not pre-commit to one extractor. Run a bake-off on the target phone:

| Candidate | Strengths | Weaknesses | Test |
|---|---|---|---|
| **NewPipeExtractor (NPE)** | Pure Java, active, handles `signatureCipher` + `n`-sig via Rhino, small APK impact, GPL-3.0 | Uses `VISIONOS`; no SABR; no built-in PO-token generator; single-client dependency | Resolve + play 20 tracks; measure success, first-audio latency, 403/SABR errors |
| **InnerTubeX** | SABR/UMP, QuackJS cipher, injectable token providers; used by Metrolist | 0.x API, small community, more integration code | Same 20-track test; verify Media3 integration |
| **youtubedl-android** | Best extraction quality; yt-dlp update cadence | ~50–70 MB/ABI, Python startup, wrapper stale (~12 months) | Last-resort test only; measure size/startup |
| **Current WebView InnerTube** | Already in repo | No cipher/n-sig/PO-token/SABR; hardcoded 2024 clients | Control; expected to fail |

**Gate:** ≥90% end-to-end playback (not just URL resolution) on the 20-track set, including at least one live/long/age-restricted track. If NPE and InnerTubeX both fail, test youtubedl-android. If all fail, stop and re-decide rather than shipping a broken player.

The chosen extractor sits behind a `StreamResolver` interface so it can be swapped later.

### 5.2 Native service

Replace the current `PlaybackService` with a clean `MediaSessionService`:

- `ExoPlayer` with `DefaultHttpDataSource` and a custom `ResolvingDataSource.Factory`.
- `MediaSession` with `MediaMetadata` (title, artist, album, artwork URI, duration).
- Let **Media3 own the notification** via `DefaultMediaNotificationProvider` (or a customized provider). Do not pre-warm a custom notification in `onCreate()`. Do not build a manual `NotificationCompat` with three actions.
- `MediaSessionService` starts foreground only when playback starts, with `mediaPlayback` type and the required permissions.
- `setSessionActivity` opens the app when the notification is tapped.
- `setHandleAudioBecomingNoisy(true)` and `setAudioAttributes(..., true)` for audio focus and headset unplug.
- `onTaskRemoved`: keep playing if `playWhenReady`; stop if paused.
- Add `MediaButtonReceiver` in the manifest for headset/Bluetooth play after a long pause.
- Implement `onPlaybackResumption()` to restore the persisted queue/position after service destruction.
- Upgrade Media3 to the current stable version at implementation time; the repo's 1.3.1 predates multiple session/notification fixes.

### 5.3 Native queue and lazy resolution

The queue lives natively, not in JavaScript:

- JS sends `setQueue(items, startIndex, position)` once.
- Native builds `MediaItem`s with `rem://track/<id>` URIs and full metadata.
- `ResolvingDataSource` maps `rem://track/<id>` to a fresh `googlevideo` URL at open time.
- Next/previous/seek/repeat/shuffle are handled by ExoPlayer and `MediaSession.Callback`; no round-trip to JS.
- Native persists queue, index, position, repeat, shuffle, and `playWhenReady` in DataStore/JSON.
- On service creation, restore the queue paused; the user taps play.
- JS reconnects after WebView suspension and calls `getSnapshot()` + `getQueue()`.
- Prefetch/resolve the next track during playback to reduce gaps.

**Queue APIs:** `getQueue`, `setQueue`, `addToQueue` (end/next), `removeFromQueue`, `moveInQueue`, `clearQueue`. The UI must recover the full queue after WebView death, not just the current track.

### 5.4 Stream resolution

- Chosen extractor (NPE or InnerTubeX) returns a URL + required headers.
- Cache resolved URLs with expiry; refresh on 403/410.
- Resolver tiers, in order:
  1. Chosen extractor, preferred audio format (Opus 251 / AAC 140).
  2. Chosen extractor, alternate format/client attempt **only if the library exposes one**.
  3. Public Invidious `local=true` proxy (manual experimental toggle; 3–5 s timeout; not a v1 acceptance dependency).
  4. Visible error with Retry/Skip. No iframe.
- Do not claim a "second NPE client" tier; NPE does not expose that.

### 5.5 Notification, permissions, and Android versions

- Media3 default MediaStyle notification gives artwork, title, artist, seekbar, play/pause, next/previous.
- Customize the small icon and channel name only; do not replace the notification layout.
- **Android 13 `POST_NOTIFICATIONS`:** media-session notifications are exempt from the runtime permission. The current unconditional request in `MainActivity` is unnecessary for playback; remove it unless the app adds other notifications.
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + `mediaPlayback` service type are required on Android 14+.
- The Android 15 6-hour FGS timeout applies to `dataSync`/`mediaProcessing`, not `mediaPlayback`; `BOOT_COMPLETED` cannot start a `mediaPlayback` FGS.
- Test Android 13, 14, 15, and 16/API 36 behavior; do not assume a new Android 16 media-specific restriction without evidence.

### 5.8 iQOO Neo 10R / Android 16 / OriginOS 6 optimizations (primary target device)

The primary Android target is the **iQOO Neo 10R — Snapdragon 8s Gen 3, 6400 mAh, Android 16 / OriginOS 6** (it shipped on Funtouch OS 15 / Android 15 and moved to OriginOS 6 via the stable rollout of 2025-12-18, firmware `PD2352BF_EX_A_16.1.10.7.W30`). All optimizations below are an *addition* to the generic Media3/FGS guidance above; Funtouch OS references from earlier revs are obsolete and must not be used.

**Why OriginOS 6 changes the picture**

- OriginOS 6 revamped the lock-screen and notification surface (new control center, Origin Island live activities). iQOO community reports show that on OriginOS 6, lock-screen media controls can be missing for some audio apps unless the media session is first-class. A hand-rolled `NotificationCompat` is the profile of app that gets ignored by the OS lockscreen.
- A proper `MediaSession` + `DefaultMediaNotificationProvider` from Media3 makes the system treat the app as a real audio player, which is how the OS surfaces lock-screen/dropdown controls reliably.

**Software rules (OriginOS 6-specific)**

- Let Media3 own the notification (`DefaultMediaNotificationProvider`, or a customized provider that only changes icon/channel). **Never** build a manual `NotificationCompat` with three actions — §5.2 already says this; on OriginOS 6 it's load-bearing, not aesthetic.
- `MediaSession` with `setSessionActivity(PendingIntent)` + `mediaPlayback` FGS type (already in the manifest) + `MediaButtonReceiver` for headset/Bluetooth resume after long pause.
- `ExoPlayer` with `WAKE_MODE_NETWORK` (keeps CPU+WiFi while screen is off) and a **partial wake lock acquired only while actually playing**; release on pause/stop.
- Audio focus: `setAudioAttributes(..., true)` + `setHandleAudioBecomingNoisy(true)` (unplug → pause) per §5.2. The current builder only sets `handleAudioFocus=true` —/becoming-noisy must be added.

**User-facing battery guidance (documented in-app, shown once at first launch if not already granted)**

- Request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and deep-link to **Settings → Battery → Battery consumption ranking** (OriginOS 6 wording; verify on-device during Phase 2) so Rem is allow-listed for high background power.
- OriginOS auto-start / background power prompts: instruct the user that Rem must be set to allowed background activity. Funtouch-era paths ("High background power consumption" under Funtouch UI) do **not** apply — copy for the docs goes against the OriginOS 6 menu names.
- Suggest the user lock Rem in Recents (app lock) so accidental swipe-away doesn't kill the service — supported behavior on OriginOS, and a cheap insurance policy.

**What not to do**

- No pre-warm of the service on plugin load (no junk notification at app start). Start the foreground service **only when playback starts**, within the 5 s FGS timeout.
- No `POST_NOTIFICATIONS` runtime request for the media notification (exempt per Android 13+ rules); only request it if other notifications are added.
- No manual 6-second watchdog that "nudges" playback.

**Targeted tests (extend §11)**

- New P0 row: **on OriginOS 6, lock-screen media controls appear without unlocking the phone.**
- Neo 10R battery-profile test: AutoStart ON vs OFF; High background power allowance ON vs OFF; 60-min lockscreen with screen **fully off** (OriginOS kills differently when dimmed); background-power-consumption soak (2-hour play, peak app memory trend, no duplicate sessions).

### 5.6 Audio focus, Bluetooth, calls

- ExoPlayer handles audio focus automatically; pause on focus loss, resume on gain if it was playing.
- Becoming-noisy pauses on headset unplug.
- MediaSession handles Bluetooth play/pause/next/previous.
- Test with a real Bluetooth headset, a phone call, Assistant, and another media app.
- Add `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` guidance/prompt with an OriginOS 6–specific battery deep-link and in-app instructions; **primary device matrix = iQOO Neo 10R (Android 16 / OriginOS 6)**, Samsung/Xiaomi/Pixel only as secondary if convenient.

### 5.7 What gets deleted

- `PlaybackService` custom notification and pre-warm.
- JS→native `mediaAction` next/previous bridge.
- `resolveStream`, `playViaYouTube`, Piped list, iframe code.
- `NativeAudio` state/seek/volume calls that target native when the iframe is active.
- The 6-second watchdog that "nudges" playback.

---

## 6. Windows — the web app in the browser (rev 2)

The Electron app from rev 1 is out of scope. The web app in Chrome/Edge **is** the Windows product. What the browser gives for free, the resolver chain, and what the extension bridge does:

### 6.1 What the browser gives us for free

- `navigator.mediaSession` → Windows media flyout: app/site identity, artwork, title/artist, seekbar timeline, play/pause/next/previous/seek buttons.
- Keyboard media keys work through the same bridge while the page is alive.
- Minimizing the tab or browser window keeps audio and queue transitions running (Windows does not suspend background-tab audio the way Android does).
- Installable PWA (manifest), desktop-shortcut launch, standalone window.
- Lifecycle is browser-owned: closing the browser stops playback. Documented behavior, not a defect; no tray, no crash-proof guarantees in v1.

### 6.2 Resolver chain (the core of this section)

Tier 1 — **extension-bridged client-side resolution** (adopted from Kira/ytc-bridge/YouTube.js/bgutils-js, all MIT):

- A small, self-written extension mimics the `ytc-bridge` pattern (~100 lines, MIT reference):
  - Injected script exposes `window.proxyFetch`.
  - Background service worker fetches on the page's behalf; before each fetch it adds a `declarativeNetRequest` **session rule** setting `origin: https://www.youtube.com` on innertube endpoints (static rules for googlevideo), then removes it.
  - The extension is loaded once via developer mode ("Load unpacked"); it is not a user-run server and not a Store dependency.
- The web app runs a `youtubei.js` session with a custom fetch → `proxyFetch`.
- In-page PO tokens via `bgutils-js`: BotGuard challenge → interpreter JS injected into the page DOM → integrity token → `WebPoMinter` → cold-start token bound to the video. A real browser does the attestation; no server involved.
- Streams: prefer progressive audio formats when the web client returns them (simple `<audio src>` + Range seek); include the **googlevideo SABR/UMP path** (custom Shaka/networking scheme per the `sabr-shaka-example`, UMP parsing is media-type-agnostic) as the modern path when progressive is unavailable. Phase 0 verifies which path audio-only should use in practice.
- Everything resolves and streams from the **laptop's own IP** — the same-IP rule is satisfied with no proxy, no localhost server, no LNA.

Tier 2 — **public-Invidious rotation with byte-proxy** (adopted from ytify's architecture, minus its private key pool):

- A configurable, ordered instance list (start from ytify's live list; refresh via `api.invidious.io/instances.json`).
- Resolve metadata/streams from `${instance}/api/v1/videos/:id`; rotate on failure, 3–5 s timeout, shuffle order per session.
- For music ("‑ Topic") tracks, play through the **instance byte-proxy** (rewrite origin per ytify's `playback.ts`) — the HTTP 206 + `Content-Range` path proven live on 2026-11-03.
- Always labeled "best-effort · community servers" in the UI; tier and instance-health reason logged.

Explicitly not copied: ytify's Netlify edge function + pooled private RapidAPI keys — paid-quota dependency, ToS exposure, and a hidden volunteer dependency. Also not in v1: any self-hosted docker companion stack (violates zero-ops).

### 6.3 Failure behavior

- Extension missing/broken → visible banner once: what Tier 1 is, how to load it, and a "Continue with community-server playback (best-effort)" action. Library/search unaffected.
- Extension loaded but an endpoint fails → error with the tier + reason code, Retry/Skip; never silent degradation.
- Tier 2 exhausted across instances → clear "community servers are down right now" state + Retry/Skip + "use the APK on your phone" note for future reference.
- No iframe fallback in the core. If a "reliability mode" is ever added (e.g., loading music.youtube.com), it is a separate, explicitly outside-the-client mode, never a silent engine switch.

### 6.4 What rev 2 deletes from rev 1's plan

- Electron shell, `electron-builder`, NSIS/portable installers, AUMID, `globalShortcut`, tray/single-instance logic.
- Bundled `yt-dlp` sidecar, JS runtime, `yt-dlp-ejs`, the `-J` headers dance, yt-dlp update strategy.
- The localhost Range proxy (port pairing, tokens, LNA prompts — no localhost exists anymore).
- License-audit burden for shipped binaries (nothing but JS/APK ships now).

---

## 7. Web PWA — same product, honest limits

The PWA is a first-class UI and library; playback depends on where and how it runs. On Windows, §6's chain applies. On mobile:

### 7.1 Surface-aware resolver

| Surface | Resolver | Expected behavior |
|---|---|---|
| **Windows browser + extension** | Tier 1 bridge | Reliable playback; SMTC/media keys; tier visible |
| **Windows browser without extension** | Tier 2 Invidious rotation | Labeled best-effort; clear upgrade banner |
| **Mobile browser + optional home relay** | Relay URL | Reliable playback from the home residential IP |
| **Mobile browser + manual experimental toggle** | Public Invidious `local=true` | Best-effort; visible label; 3–5 s timeout; no acceptance gate |
| **Mobile browser otherwise** | None | Library/search shell; "Use the APK for reliable playback" |

**Drop from v1:** any localhost/loopback resolver, public Invidious as an unlabeled default, silent fallbacks of any kind, and any mobile background-playback guarantee.

### 7.2 Local Network Access — only if a LAN relay is configured

With the helper architecture gone, the PWA no longer talks to any localhost/LAN endpoint in v1. LNA permission prompts become relevant only if/when the optional home relay is on the home LAN rather than a Tailscale address. Keep the generic "denied/unsupported → clear instructions" error path so a relay URL can never hard-fail obscurely.

### 7.3 Search dependency

- Web search uses the free Vercel `/api/search` serverless endpoint (and `/api/info`, `/api/suggestions`) when reachable.
- This is a **hosted service**, not a user-run backend. It is free and requires no operations.
- If it is unavailable, the web app works for cached/library content only. State this in the UI; do not claim "search always works."
- Android search uses direct InnerTube (already works) or native extractor search.
- **Stretch (Phase 3, optional):** when the Tier-1 bridge is active on Windows, route search through the same bridge session, which would drop the Vercel dependency for the primary laptop experience. Keep Vercel as the default in v1 to stay simple.

### 7.4 What the PWA will not do

- It will not use a hidden/cross-origin YouTube iframe for audio.
- It will not promise background playback on mobile without a resolver.
- It will not silently switch engines or fall back to a worse tier without logging and labeling.
- It will not depend on a Vercel stream endpoint or a paid key pool.

### 7.5 Offline

- PWA manifest, service worker, offline app shell.
- Cache library metadata and recent search results.
- Do not attempt audio downloads in the browser in v1; cross-origin downloads and storage are unreliable.

### 7.6 Optional home relay (the only reliable mobile-web path)

Unchanged from rev 1. If mobile-web parity becomes a must:

- Raspberry Pi/NAS/router running the same resolver + Range proxy (or Invidious with `local=true`).
- Exposed over Tailscale (free personal plan) or Cloudflare Tunnel (free tier).
- The PWA points at the relay; the relay resolves and proxies from the home IP.
- Cost: $0 if the user already owns an always-on device; otherwise ~$60–100 one-time plus a few dollars of electricity per year.
- This is an always-on backend by definition. It is optional, not part of the zero-backend promise.
- It also doubles as a belt-and-suspenders path for the laptop if both web tiers degrade simultaneously.

---

## 8. Shared core

### 8.1 Ports and modules

```
src/core/
  playback/
    types.ts          # PlaybackPort, PlaybackSnapshot, PlaybackError
    stateMachine.ts   # pure reducer: idle/loading/playing/paused/error
    queue.ts          # pure queue operations: next/prev/shuffle/repeat/mutate
    commands.ts       # request IDs, cancellation, stale-response guards
  search/
    types.ts          # SearchPort, SearchResult
    parser.ts         # shared InnerTube parser
  library/
    types.ts          # Playlist, History, Favorite
    storage.ts        # versioned local persistence, export/import
  resolver/
    types.ts          # ResolverPort, ResolvedStream
    chain.ts          # ordered resolver tiers with health checks
    bridgeClient.ts   # youtubei.js + proxyFetch + bgutils-js session (Tier 1)
    invidious.ts      # instance rotation + byte-proxy URL builder (Tier 2)
```

### 8.2 State ownership

| State | Owner | Mirrored to UI |
|---|---|---|
| Playback state, position, duration | Native service (APK) / audio element (web) | Yes, via snapshot events |
| Queue order, index, repeat, shuffle | Native (APK) / JS store (web) | Yes, via snapshot + `getQueue` |
| Library, playlists, history | Local store (all surfaces) | Yes |
| Search results | Local cache | Yes |
| Resolved stream URLs / PO tokens | Resolver cache (native service / web resolver chain) | No |
| Active resolver tier | Resolver chain | Yes, labeled |
| Notification metadata | Native MediaSession / page MediaSession | Derived from track |

### 8.3 Search and metadata

- **Android:** direct InnerTube search via `CapacitorHttp` (already works) or native extractor search. No backend.
- **Web:** Vercel `/api/search` (free serverless) or cached/library content by default; direct InnerTube via the Tier-1 bridge as the Phase 3 stretch. Public Invidious search only inside the Tier-2 experimental mode.
- **Info/suggestions:** Vercel endpoints when reachable; direct InnerTube fallback on Android (and via the bridge on Windows).
- **Artwork:** direct `i.ytimg.com` URLs; no proxy needed.
- **No paid YouTube Data API dependency.** The free 10k-unit quota allows only ~100 searches/day and forbids audio/background use.

### 8.4 Library and sync

- Local-first: playlists, history, favorites, queue, volume, theme.
- Versioned schema; migration on load.
- Export/import JSON (manual cross-device transfer).
- Optional later: Syncthing folder for JSON sync, or YouTube Music account sync via a secondary account. Do not build a sync server.
- Do not require login in v1.
- Library conflict policy: last-write-wins for v1; document it; add merge later if sync is added.

### 8.5 Offline

- Android: ExoPlayer `DownloadManager`/`CacheDataSource`; download button; storage management. Defer to v1.1 unless Phase 4 has slack.
- Web: cache metadata and app shell only.
- Offline mode must show clear errors for non-downloaded tracks; no infinite spinner.

---

## 9. Free operations

| Need | Choice | Cost | Notes |
|---|---|---|---|
| Android distribution | GitHub Releases, signed APK | $0 | Private releases until licensing decision; no Play Store fee |
| Web hosting | Cloudflare Pages or Vercel Hobby | $0 | Static build only; no stream proxy |
| Browser extension | Self-written, loaded unpacked | $0 | Developer-mode install; no Store fee; documentation + reload note |
| Windows surface | Browser (Chrome/Edge) + PWA | $0 | No installer, no signing, no SmartScreen |
| Search/metadata | On-device + optional Vercel serverless | $0 | Vercel documented dependency for web-by-default; bridge stretch reduces it |
| Extractor/resolver updates | NPE/InnerTubeX + youtubei.js/googlevideo releases | $0 | Monthly check + canary; patch on breakage |
| Library sync | Export/import; optional Syncthing | $0 | No sync server |
| Optional mobile-web relay | Existing Pi/NAS + Tailscale | $0–100 one-time | Only if mobile-web parity required |
| Code signing | None | $0 | Nothing installed system-wide except the APK |
| Monitoring | Local logs + diagnostics export | $0 | No telemetry; redact tokens |

**What we stop depending on:** Vercel stream functions, Piped, public Invidious as an unlabeled primary, any always-on laptop server, any desktop packaging chain, any paid API.

---

## 10. Work breakdown — divide and conquer

Estimates are focused work days for one developer with AI assistance. They include device testing and packaging, not just coding. Calendar time depends on availability. Each phase has a gate; do not start the next phase until the gate passes.

### Phase 0 — Spikes and decision gates (3–5 days)

- **Android extractor bake-off:** NPE vs InnerTubeX; 20-track end-to-end test; youtubedl-android as last resort; measure success, first-audio, 403/SABR.
- **Android playback spike:** minimal `MediaSessionService` + ExoPlayer + default notification; queue of 3; lock screen 10 minutes; kill WebView; next/previous/seek; `MediaButtonReceiver`/resumption.
- **Windows-web spike (adopt-and-verify, not invent):**
  - Load a minimal `ytc-bridge`-pattern extension (origin-stamping `proxyFetch`) in Chrome and Edge.
  - Run a `youtubei.js` session through the bridge; mint in-page PO tokens with `bgutils-js`.
  - Attempt progressive audio formats from the web client; if unavailable, wire the `googlevideo` SABR/UMP path (Shaka custom scheme per `sabr-shaka-example`) and confirm audio-only segment playback.
  - Run the 20-track set from the laptop IP; record success/latency; verify MV3 session-rule behavior and any throttling with the tab minimized.
  - Stand up the Tier-2 fallback in parallel: instance rotation + byte-proxy for music tracks (ytify's `getStreamData.ts`/`playback.ts` as the reference algorithms).
- **Build-vs-adopt benchmark:** install SimpMusic (Android) and run the same 20 tracks; play music.youtube.com/Pear in the laptop browser as a usage reference. Benchmark and fallback triggers only, not forks of our UI.
- **Decision gate:** Android end-to-end ≥90%; **Windows-web Tier-1 ≥90% on the same 20-track set**. If Tier-1 fails, Tier-2-only v1 with stronger labeling proceeds — record which tier each track used. If both fail, re-decide before Phase 1.

**Deliverable:** `docs/research/spike-results.md` with numbers and go/no-go.

### Phase 1 — Core contract and cleanup (3–5 days)

- Add `src/core/playback` types, pure state machine, pure queue operations, command/cancellation logic.
- Add Vitest and the first unit tests (queue, repeat, shuffle, stale requests, queue mutation).
- Create `usePlayback()` that selects an adapter per platform.
- Put the old `useAudioPlayer` behind a `V2_PLAYER` flag.
- Define `ResolverPort`, `ResolverChain`, `bridgeClient`, `invidious` interfaces.
- Add a fake adapter for UI development and tests.
- Add error taxonomy and retry/backoff policy.

**Gate:** UI can play/pause/next/seek/queue-mutate against the fake adapter; unit tests pass; no native calls from React effects.

### Phase 2 — Android reliable playback (3–5 weeks)

- Rewrite `PlaybackService` as a clean `MediaSessionService`.
- Integrate chosen extractor + `ResolvingDataSource`.
- Add native queue, persistence, repeat/shuffle, audio focus, noisy handling, resumption, `MediaButtonReceiver`.
- Let Media3 own the notification; remove custom notification code and pre-warm.
- Add Capacitor plugin API (`setQueue`, `getQueue`, `play`, `pause`, `seek`, `setVolume`, `setRepeat`, `setShuffle`, queue mutations, `getSnapshot`, listeners).
- Remove JS→native next/previous bridge.
- Add error events and retry/skip UX.
- Add battery-optimization prompt and diagnostics.
- Test on at least two Android versions/OEMs.

**Gate:** Android P0 tests pass; WebView killed; no iframe/Piped calls in logs; queue survives WebView death.

### Phase 3 — Web PWA, Windows playback, resolver chain (3–4 weeks)

- Build the PWA target from the same UI; `WebPlaybackAdapter` (HTML5 audio + MediaSession metadata/actions; SABR-backed stream when Tier 1 requires it).
- Finalize the extension (`extension/`): minimal origin-bridge, no broad host permissions beyond needed origins, clean failure states.
- Implement `ResolverChain` with Tier 1/Tier 2, visible tier labeling, timeout/rotation policy, and diagnostics logging.
- Add PWA manifest, service worker, offline shell; "Load the extension" instructions; "Use the APK" mobile guidance.
- (Stretch) Route search through the bridge when Tier 1 is active.
- Test Windows Chrome + Edge and mobile Chrome/Brave.

**Gate:** Windows web P0 tests pass (§11); mobile PWA is a working library/search shell with clear guidance; no iframe; tiers logged and labeled; no silent fallback.

### Phase 4 — Library, offline, and transfer (1–2 weeks)

- Versioned library schema and migrations.
- Playlists, favorites, history, search history.
- Export/import JSON with validation.
- Android downloads via Media3 `DownloadManager`/`CacheDataSource` (v1.1 if schedule slips).
- Storage management and offline error states.
- Optional Syncthing integration notes.

**Gate:** library survives restarts; export/import round-trips; downloaded tracks play in airplane mode on Android; non-downloaded tracks show a clear error.

### Phase 5 — Decommission and release (3–5 days)

- Delete old `useAudioPlayer`, `streamResolver`, iframe/Piped code.
- Remove `api/stream` and Vercel stream rewrites if present.
- Remove the user-facing `serverUrl` setting.
- Remove the old Express server from the repo root once the web resolver chain is proven.
- Update README, PRODUCT, DESIGN, and docs.
- Add build scripts: `build:web`, `build:android`, `build:extension`.
- Versioning, changelog, signed APK, extension release note/graphic.
- Release checklist and rollback notes.
- License audit sign-off: all shipped code is JS we wrote + Apache/MIT deps (bridge/bgutils/youtubei.js/googlevideo) + NPE GPL-3.0 (APK only); no binary redistribution.

**Gate:** `git grep` shows no iframe/Piped/old resolver in the runtime; all three builds succeed; acceptance tests pass.

### Phase 6 — Polish (ongoing)

- Gapless/crossfade (format-dependent; revisit with SABR/WebCodecs later).
- Volume normalization/DSP.
- Lyrics, recommendations, Android Auto, widgets.
- Search quality, caching, artwork quality.
- Cross-device sync (optional).
- Optional home relay.
- Startup canary track + weekly extractor health check.
- Extension upkeep: track Chromium/MV3 changes and `ytc-bridge`/`youtubei.js` upstream releases; reload/reinstall instructions stay current.
- Maintenance budget: 2–4 hours/month; if breakage exceeds it, the fallback ladder is documented in §13.

---

## 11. Acceptance tests

### Android P0

| ID | Test | Pass criteria |
|---|---|---|
| A1 — Lockscreen playback | 10-track queue, lock screen, 60 minutes, Bluetooth connected | Audio continues; transitions occur; notification remains; no duplicate audio |
| A2 — Notification identity | Different artwork/title/artist; reload WebView while native plays | Metadata correct; no placeholder; updates on next/previous; survives WebView reload |
| A3 — Seek/next controls | Notification, lockscreen, wired headset, Bluetooth; WebView backgrounded | Native queue advances; seek ±2 s; UI rehydrates; no JS dependency |
| A4 — Track-change cancellation | 5 s resolver delay; rapid next ×5, previous ×2, select a track | Only final track plays; stale responses ignored; metadata matches audio |
| A5 — Resolver offline | Kill proxy/network; wait; restore | Buffered audio continues; next fails visibly; no iframe; retry recovers |
| A6 — WebView independence | Reload/background/swipe away while playing | Native audio continues; reopening rehydrates snapshot + queue |
| A7 — Pause >10 min | Pause, wait >10 min, press headset play | Resumes correct track/position via MediaButtonReceiver/onPlaybackResumption |
| A8 — Audio focus/Bluetooth | Call, Assistant, another media app, unplug, AVRCP | Pause/duck/resume per policy; no double audio; headset controls native queue |
| A9 — Android versions / OriginOS | Android 13/14/15/16; deny POST_NOTIFICATIONS; FGS checks; **primary device = iQOO Neo 10R (Android 16 / OriginOS 6)** | Media notification appears (media exemption) **and lock-screen media controls appear without unlocking the phone on OriginOS 6**; `mediaPlayback` FGS starts; no FGS exception |
| A10 — Single engine | `dumpsys media_session` + network inspection | One active session; no iframe/WebView audio; ExoPlayer only |
| A11 — Queue/repeat/shuffle | 20-track queue; repeat one/all; shuffle; boundaries | Correct order; no duplicates/skips; gapless where format supports it; defined gap policy |
| A12 — Queue mutation | Add/remove/reorder/play-next/clear; WebView killed | Native queue reflects menu actions; UI recovers; no divergence |
| A13 — Error taxonomy | Force SABR/PO-token/login/geo/rate-limit/network failures | Correct code/message; retryable vs terminal; no infinite spinner |
| A14 — Cold start | Kill app; service restores queue paused; notification correct | Tapping opens app; play resumes correctly |
| A15 — OriginOS background profile | Neo 10R: AutoStart ON/OFF; High background power allowance ON/OFF; screen fully off vs dimmed; app locked in recents; 60-min lockscreen; 2-h soak | Playback continues in all supported profiles; app reappears in recents lock; peak app memory trend flat; no duplicate sessions |

### Windows web P0 (Chrome and Edge)

| ID | Test | Pass criteria |
|---|---|---|
| N1 — Media flyout/keys | Play in Chrome and Edge; minimize tab; 60 min | SMTC metadata/artwork/timeline correct; media keys + flyout controls work; audio continues |
| N2 — Tab ownership | Reload page; open second tab | No duplicate audio; single owner; reloaded UI reattaches state silently |
| N3 — Tier-1 resolution | 20-track set through extension bridge, laptop IP | ≥90% end-to-end (matching Phase 0 numbers); tier shown in UI; no iframe |
| N4 — Minimized/tab throttling | Minimize; compare playback progress vs wall clock | Throttling does not stall audio or transitions |
| N5 — Tier-2 fallback | Disable/remove extension | Music-track playback via instance byte-proxy; "best-effort" label visible; rotation recovers from a dead instance within 3–5 s |
| N6 — Tier-2 exhausted | Block all listed instances | Clear state + Retry/Skip; no spinner; library/search unaffected |
| N7 — Reliability soak | 2-hour playback, incl. minimize/restore cycles, laptop lid sleep + wake | Clean stop on sleep-defined browser policy; clean resume state; no memory creep; no duplicate sessions |
| N8 — Search dependency | Vercel unavailable | Cached/library works; clear search-unavailable state |

### Web P0 (mobile browser)

| ID | Test | Pass criteria |
|---|---|---|
| W1 — Same-frame MediaSession | Inspect DOM/metadata | `<audio>` in top-level; no YouTube iframe; metadata/actions from page |
| W2 — Range/seek | Seek repeatedly; inspect network | `206`, `Content-Range`, `Accept-Ranges`; no `setPositionState` throw |
| W3 — Close/reload/multiple tabs | Close/reload/two tabs | Close stops; no autoplay without gesture; one owner |
| W4 — Best-effort labeling | Manual Invidious toggle / relay | Label visible; timeout 3–5 s; guidance to APK shown |
| W5 — Offline shell | Offline load | App shell + cached library; non-downloaded error |
| W6 — Search dependency | Vercel unavailable | Cached/library works; clear state |

### Cross-cutting P0

| ID | Test | Pass criteria |
|---|---|---|
| C1 — Metadata parity | Compare UI/notification/SMTC | Same title/artist/album/artwork/duration |
| C2 — State parity | Compare UI/native snapshot after resume | Drift <1 s; no "playing" UI with stopped audio |
| C3 — No silent fallback | Force failures | Explicit error/retry; no engine switch; tier labeled and logged |
| C4 — Soak | 2-hour playback on APK + Windows web | No ANR, unbounded memory, notification spam, duplicate sessions |
| C5 — Track-change cancellation | Slow resolver + rapid actions on all surfaces | Latest intent wins; old requests cancelled |
| C6 — Hygiene | Extensions/hosts/tokens | Extension host permissions limited to needed origins; tokens redacted; no telemetry |
| C7 — Diagnostics | Export logs | Extractor/resolver version, track ID, error code, resolver tier; no secrets |
| C8 — Legal | Release review | No login; no public distribution until license decision; ToS disclaimer; no paid key pool |

---

## 12. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| YouTube changes clients/PO tokens/SABR | High | Playback breaks | Upstream stacks are actively maintained (youtubei.js docs 2026-10-20; googlevideo releases; NPE/InnerTubeX); swappable resolvers; canary; visible errors; fast patch cadence |
| BotGuard/attestation changes break in-page PO minting | Medium | Tier 1 degrades to Tier 2 | `bgutils-js`/youtubei.js upstream tracking; canary warns before users hit it; Tier 2 keeps music playable |
| Chromium MV3/API changes affect the extension bridge | Medium | Tier 1 fails in new browser versions | Keep the extension tiny (~100 lines) and documented; track `ytc-bridge`; reinstall/reload instructions maintained |
| Public Invidious instances disappear | High | Tier 2 weakens; mobile best-effort degrades | Rotation across a refreshed instance list; APK is primary on mobile; home relay escape hatch |
| Extractor maintenance exceeds budget | Medium | Project stalls | 2–4 h/month budget; fallback ladder (SimpMusic / ReVanced on phone; music.youtube.com on laptop) documented in §13 |
| NewPipeExtractor GPL obligations | Medium | Legal if distributed | Private repo/releases for personal use; if public, GPL-3.0 compliance or replace with permissive extractor |
| Android OEM kills foreground service | Medium | Background stops | `mediaPlayback` FGS, wake lock, battery-optimization prompt; **primary device = iQOO Neo 10R (Android 16 / OriginOS 6)**; OriginOS-specific battery guidance in §5.8 |
| Android 15/16 FGS changes | Medium | Service start/resume issues | Follow current FGS rules; **test on API 36 (your Neo 10R runs Android 16)**; MediaButtonReceiver/resumption |
| OriginOS 6 lock-screen media regression | Medium | No lock-screen controls | Media3-owned notification + `MediaSession` (same-frame); no hand-rolled `NotificationCompat`; test N/A to the APK |
| Account flags if logging in | Medium | Account risk | No login in v1; secondary account if sync later; never use primary cookies |
| Search dependency (Vercel) | Medium | Web search degraded | Document dependency; cached/library fallback; bridge stretch reduces it; Android unaffected |
| Mobile-web expectation gap | High | Disappointment | Capability matrix; APK is reliable; PWA labels mode; optional home relay |
| Scope creep | High | Never ships | Phase gates; v1 cut line; defer v1.1 items; desktop app already cut in rev 2 |

---

## 13. Alternatives and verdicts

| Alternative | Reliability | Effort | Control | Verdict |
|---|---|---|---|---|
| **SimpMusic (Android)** | 8–9/10 | Very low | Low | **Phase 0 benchmark/gate.** If custom UI is not a hard requirement, adopt/fork it. Shares the NPE/InnerTube engine lineage with our APK. |
| **Pear Desktop / music.youtube.com on the laptop** | 9/10 | Very low | Low | **Laptop usage fallback.** YouTube's own web player; not our UI; the escape hatch if both web tiers degrade. |
| **ReVanced YouTube Music** | 9–10/10 | Very low | None | **Zero-build baseline on the phone.** Gray-area patched client; benchmark only, never distribute. |
| **Adopt/fork ytify as the web app** | 6–7/10 (instance-dependent) | Very low | Low | **Benchmark for Tier 2.** Do not fork wholesale: private RapidAPI pool + their UX. Steal the rotation/byte-proxy architecture (GPL note: independent clean-room implementation of the pattern, or GPL-compliant fallback if copied). |
| **Extension-bridged client-side web playback (Kira/ytc-bridge style)** | 8/10 | Medium | High | **Adopted in rev 2 as Tier 1.** Proven upstream, MIT-licensed references, resolves on the laptop's own IP. |
| **Electron/Tauri desktop app (rev 1's path)** | 8/10 | High | High | **Cut in rev 2.** Packaging/maintenance cost with no reliability advantage over browser + extension for this scope. Archived with rev 1. |
| **Full native rewrite (Compose Multiplatform)** | 8/10 | Very high | High | **Deferred.** Reconsider after v1. |
| **mpv/libmpv (native desktop audio)** | 9/10 | High | High | **Dropped with the desktop scope.** |
| **Home relay (Pi/NAS + Tailscale)** | 9/10 | Medium | High | **Optional.** The only reliable mobile-web path; belt-and-suspenders for the laptop. |
| **youtubedl-android** | 7/10 | Medium | Medium | **Phase 0 fallback** for the APK if NPE/InnerTubeX fail. |
| **InnerTubeX** | 8/10 | Medium | High | **Co-primary for the APK.** SABR/UMP + token providers. 0.x risk acknowledged. |
| **Self-hosted dockers (giwty Beatbump, Invidious+companion, Materialious full stack)** | 8/10 | Low | High | **Rejected for zero-ops.** The user would operate containers — excluded by constraint. |
| **ytify's RapidAPI edge-function gate** | 7/10 | Low | Low | **Rejected.** Private key pool, paid-tier quota, hidden dependency. |
| **PWA + serverless stream proxy** | 0/10 | Low | Medium | **Dead.** Datacenter IP block + IP-bound URLs. |
| **PWA + hidden YouTube iframe** | 1/10 mobile | Low | Low | **Removed.** Cross-origin, no MediaSession ownership, background suspension, policy issues. |
| **Cantio / IFrame-Player-only clients** | 6/10 | Low | Low | **Rejected for the core.** YouTube owns the player; ads possible; not an audio-architecture. |

**Decision (rev 2):** build custom UI + proven engines. Android: NPE or InnerTubeX + Media3. Web: extension-bridged client-side resolution (Tier 1) with labeled Invidious rotation (Tier 2). Keep SimpMusic/Pear/ReVanced as benchmarks and fallback triggers. Do not build serverless, iframe, docker, or paid-pool playback paths.

---

## 14. Open decisions for sign-off

1. **Mobile web expectation:** accept "best-effort PWA + reliable APK" for v1, or add the optional home relay in v1.1?
2. **Login:** confirm no Google login in v1; local library + export/import; secondary account only if sync is added later.
3. **Distribution:** private repo/private releases for personal use, or public GPL-3.0 open source? This covers the APK **and** the extension, and drives the NPE GPL path.
4. **Extension install UX:** accept a one-time developer-mode "Load unpacked" extension on Windows (no Chrome Web Store publish in v1)? Recommended: yes; publishing to the Store can be a v1.1 item.
5. **Tier 2 default:** on Windows without the extension, do we enable labeled best-effort playback by default (recommended) or require opting in?
6. **Bridge search stretch:** attempt in Phase 3 (recommended, low cost) or defer?
7. **Downloads:** v1 or v1.1? Recommendation: v1.1 unless Phase 4 has slack.
8. **Home relay:** do you already own an always-on Pi/NAS/router? If yes, mobile-web parity is cheap later.
9. **Build vs adopt:** confirm the custom UI is still worth the 7–12 week estimate versus adopting SimpMusic/ReVanced. The plan assumes yes.

---

## 15. Implementation rules

- Create a new branch from `main` only after sign-off: `rebuild/v2-playback`.
- No commits or pushes until the plan is approved and Phase 0 gates pass.
- Build new modules behind flags; keep the old player until Phase 5.
- Every phase ends with a demo and the acceptance tests for that phase.
- No silent engine switching; log the resolver tier and error code.
- Keep the UI and domain code platform-agnostic; no `Capacitor.isNativePlatform()` checks scattered through components.
- Delete dead code aggressively at Phase 5, not before.
- Update this document when a gate changes the plan.
- Maintain a release checklist and a rollback path for extractor updates and extension changes.

---

## 16. Source basis

### Playback, MediaSession, Android, browser platform

- W3C Media Session, Editor's Draft (5 June 2026): https://w3c.github.io/mediasession/
- MDN Media Session API: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API
- Chrome for Developers, Media Session API (same-frame rule): https://developer.chrome.com/blog/media-session
- Chrome for Developers, Page Lifecycle API: https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- Chrome Local Network Access (only relevant to a future LAN relay): https://developer.chrome.com/blog/local-network-access
- Chrome autoplay policy: https://developer.chrome.com/blog/autoplay
- MDN `MediaSession.setPositionState`: https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setPositionState
- Android Media3 background playback: https://developer.android.com/media/media3/session/background-playback
- Android media controls on mobile: https://developer.android.com/media/implement/surfaces/mobile
- Android 13 media controls: https://developer.android.com/about/versions/13/features#improved-media-controls
- Android notification runtime permission (media exemption): https://developer.android.com/develop/ui/views/notifications/notification-permission
- Android 14 FGS types: https://developer.android.com/about/versions/14/changes/fgs-types-required
- Android 15 behavior changes: https://developer.android.com/about/versions/15/behavior-changes-15
- Android 16 behavior changes: https://developer.android.com/about/versions/16/behavior-changes-16
- Android FGS service types: https://developer.android.com/develop/background-work/services/fgs/service-types#media-playback
- Media3 `ResolvingDataSource`: https://developer.android.com/reference/androidx/media3/datasource/ResolvingDataSource
- Media3 caching: https://developer.android.com/media/media3/exoplayer/network-stacks#caching
- Media3 gapless: https://developer.android.com/media/media3/exoplayer/gapless
- Capacitor App API: https://capacitorjs.com/docs/apis/app
- Android `WebView.onPause()`: https://developer.android.com/reference/android/webkit/WebView#onPause()
- Capacitor `BridgeActivity` source: https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java
- Chrome MV3 / declarativeNetRequest: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest

### In-browser client field research (added 2026-11-04)

- ytify — repository, commits, and reference modules: https://github.com/n-ce/ytify · https://raw.githubusercontent.com/n-ce/ytify/main/src/modules/getStreamData.ts · https://raw.githubusercontent.com/n-ce/ytify/main/src/modules/playback.ts · https://raw.githubusercontent.com/n-ce/ytify/main/netlify/edge-functions/stream.ts
- Kira (client-side reference client): https://github.com/LuanRT/kira · https://raw.githubusercontent.com/LuanRT/kira/main/src/services/botguard.ts · https://raw.githubusercontent.com/LuanRT/kira/main/proxy/deno.ts
- ytc-bridge (extension bridge reference, MIT): https://github.com/LuanRT/ytc-bridge
- bgutils-js (in-page BotGuard/PO tokens, MIT): https://github.com/LuanRT/bgutils-js
- YouTube.js: https://github.com/LuanRT/YouTube.js · https://ytjs.dev/guide/browser-usage.html
- googlevideo (SABR/UMP) and the Shaka example: https://github.com/LuanRT/googlevideo · https://github.com/LuanRT/googlevideo/tree/main/examples/sabr-shaka-example
- Invidious + invidious-companion: https://github.com/iv-org/invidious · https://github.com/iv-org/invidious-companion
- Materialious: https://github.com/Materialious/Materialious
- Beatbump original (archived 2025-10-03) and giwty continuation: https://github.com/snuffyDev/Beatbump · https://github.com/giwty/Beatbump
- Hyperpipe (discontinued 2025-07-14): https://codeberg.org/Hyperpipe/Hyperpipe
- Piped: https://github.com/TeamPiped/Piped
- Instance-network health (secondary, 2026-03): https://dev.to/selfhostingsh/invidious-vs-piped-4ijn

### Extraction and zero-backend landscape

- NewPipeExtractor: https://github.com/TeamNewPipe/NewPipeExtractor (GPL-3.0; VISIONOS; no SABR; PO-token provider interface only)
- yt-dlp: https://github.com/yt-dlp/yt-dlp
- yt-dlp FAQ (same IP/headers): https://github.com/yt-dlp/yt-dlp/wiki/FAQ
- yt-dlp PO Token Guide: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- yt-dlp datacenter block: https://github.com/yt-dlp/yt-dlp/issues/16773
- Invidious instances: https://api.invidious.io/instances.json · https://docs.invidious.io/instances/
- Invidious `local=true` parameter: https://docs.invidious.io/url-parameters/
- YouTube background play/Premium: https://support.google.com/youtube/answer/6308116
- YouTube API developer policies: https://developers.google.com/youtube/terms/developer-policies
- YouTube Terms of Service: https://www.youtube.com/t/terms
- YouTube Data API quota: https://developers.google.com/youtube/v3/determine_quota_cost
- Vercel function limits: https://vercel.com/docs/functions/limitations
- Cloudflare Pages/Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Tailscale pricing: https://tailscale.com/pricing
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

### Existing apps and alternatives

- SimpMusic: https://github.com/maxrave-dev/SimpMusic
- Metrolist: https://github.com/MetrolistGroup/Metrolist
- InnerTubeX: https://github.com/MetrolistGroup/innertubex
- Pear Desktop: https://github.com/pear-devs/pear-desktop
- ReVanced patches: https://gitlab.com/revanced/revanced-patches
- youtubedl-android: https://github.com/yausername/youtubedl-android
- InnerTune: https://github.com/z-huang/InnerTune
- ViMusic: https://github.com/vfsfitvnm/ViMusic (archived)
- RiMusic: https://github.com/fast4x/RiMusic (archived)

---

**Final note (rev 2):** the plan is deliberately conservative. The APK is the reliable product on the phone; on Windows the browser + one extension is the best free path that satisfies the same-IP rule with nothing running; every fallback is labeled, never silent, and never a lie about the platform.
