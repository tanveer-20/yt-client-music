# Device Profile: iQOO Neo 10R (India) on OriginOS 6 / Android 16

**Research date / access date:** 2026-11-05  
**Target device:** iQOO Neo 10R (India), public model `I2221`, firmware/project prefix `PD2352BF`  
**Scope:** Device identity, OriginOS 6 changes, background/battery controls, foreground-service and media-notification behavior, known media bugs, and app-specific mitigations for `com.ytmusic.app`.  
**Method:** First-party vivo/iQOO pages and moderator posts, Android/AOSP developer documentation, Media3 documentation and source, third-party OriginOS 6 guides, and community bug reports. No physical Neo 10R was available for ADB verification.

> **Bottom line:** `[Secondary]` The Neo 10R launched on Funtouch OS 15 / Android 15; `[Official]` it now runs OriginOS 6 / Android 16. `[Community report]` Standard `MediaSession` notifications and lock-screen controls can work for third-party apps, but vivo's Origin Player / Origin Island media card is reported to be package-allowlisted and, on this device, limited to the default Music app and Spotify. `[Official]` Our current app posts its own plain foreground notification using the same notification ID (`1001`) that Media3 uses for its automatic `MediaStyle` notification. `[Unverified]` The visible notification may therefore be replaced by the plain one; verify that on-device before changing code.

## Evidence legend

| Marker | Meaning in this document |
|---|---|
| `[Official]` | First-party vivo/iQOO documentation or moderator posts, Android/AOSP developer documentation, Media3 documentation/source, or this repository's own manifest/source for app-state claims. |
| `[Community report]` | User reports, maintainer issue threads, or non-moderator forum posts. These are observations, not vendor guarantees. |
| `[Secondary]` | Third-party guides, news, or device databases such as GSMArena, Cyber Raiden, and dontkillmyapp. |
| `[Unverified]` | Plausible but not confirmed on a Neo 10R running OriginOS 6, including inferred mechanisms, candidate intents, unconfirmed settings keys, and advice that depends on on-device verification. |

**Confidence rule:** A claim is only treated as device-specific when a source explicitly names the Neo 10R or OriginOS 6. Paths, intents, and allowlists reported on other vivo/iQOO models are treated as candidates until checked on the target unit.

---

## 1. Device identity and firmware

### 1.1 Identity table

| Item | Value | Evidence |
|---|---|---|
| Marketing name | iQOO Neo 10R (India) | `[Official]` iQOO India product page (S1) |
| Public model number | `I2221` | `[Secondary]` GSMArena (S2) |
| Firmware/project prefix | `PD2352BF` | `[Official]` build strings in iQOO Community update post (S3) |
| Announcement / release | 2025-03-11 / 2025-03-19 | `[Secondary]` GSMArena (S2) |
| Launch OS | Funtouch OS 15 based on Android 15 | `[Secondary]` GSMArena (S2); `[Official]` iQOO India page still advertises Funtouch OS 15 at access time (S1) |
| Current major OS | OriginOS 6 based on Android 16 | `[Official]` iQOO Community moderator update (S3) |
| Stable rollout start | 2025-12-18, build `PD2352BF_EX_A_16.1.10.7.W30` | `[Community report]` iQOO Community rollout thread (S4) |
| Moderator-documented build | `PD2352BF_EX_A_16.1.12.0.W30`, Android 16, January 2026 security patch, ~0.95 GB | `[Official]` iQOO Community moderator post (S3) |
| Chipset / GPU | Snapdragon 8s Gen 3 (`SM8635`), Adreno 735 | `[Secondary]` GSMArena (S2) |
| Display | 6.78-inch AMOLED, 1260 × 2800, 144 Hz | `[Official]` product page (S1); `[Secondary]` GSMArena (S2) |
| Memory / storage | 8 or 12 GB RAM; 128 or 256 GB storage | `[Official]` product page (S1); `[Secondary]` GSMArena (S2) |
| Battery / charging | 6400 mAh Si/C, 80 W wired | `[Official]` product page (S1); `[Secondary]` GSMArena (S2) |
| Connectivity | Wi-Fi 6, Bluetooth 5.4, no NFC, IR blaster | `[Secondary]` GSMArena (S2) |
| Body / rating | 196 g, IP65, no 3.5 mm jack | `[Secondary]` GSMArena (S2) |

### 1.2 What the identifiers mean

- `[Secondary]` `I2221` is the model number reported by GSMArena and is the safest public identifier for support scripts and documentation. (S2)
- `[Official]` `PD2352BF` appears in the official firmware string `PD2352BF_EX_A_16.1.12.0.W30`; it is a firmware/project identifier, not a marketing name. (S3)
- `[Unverified]` We found no official source that maps `PD2352BF` to a public codename; do not present it as one. (S3)
- `[Unverified]` The `EX` segment in the build string is likely a regional/export marker, but vivo has not documented the build-number grammar publicly; treat that reading as an inference. (S3)

### 1.3 Launch OS versus current OS

- `[Secondary]` The Neo 10R launched on Funtouch OS 15 / Android 15. (S2)
- `[Official]` At access time, the iQOO India product page still described the device with Funtouch OS 15; the OriginOS 6 rollout is documented separately in iQOO Community. (S1, S3)
- `[Official]` The current major upgrade is OriginOS 6 on Android 16, with a January 2026 security patch in the moderator-documented build. (S3)
- `[Community report]` A non-moderator rollout post reports the first stable OriginOS 6 build as `PD2352BF_EX_A_16.1.10.7.W30` on 2025-12-18. (S4)
- `[Unverified]` Build numbers and rollout dates can vary by region, carrier, and staged rollout batch; use the build string from the device under test, not the table above, as the source of truth. (S3, S4)

### 1.4 Support horizon

- `[Official]` iQOO Community's update-policy thread lists the Neo 10R under monthly security updates. (S5)
- `[Secondary]` GSMArena states “up to 3 major OS updates” for the device. (S2)
- `[Unverified]` We found no official end-of-support date or guaranteed final OS version. A community estimate of “May 2028” is not corroborated by vivo documentation. (S2, S5)
- `[Unverified]` Because OriginOS 6 is already the device's first major upgrade after launch, the practical support window for Android 17/18 is not knowable from public sources reviewed. (S2, S5)

---

## 2. OriginOS 6 rollout and what changed

### 2.1 Rollout and update content

| Item | Detail | Evidence |
|---|---|---|
| Upgrade | Funtouch OS 15 / Android 15 → OriginOS 6 / Android 16 | `[Official]` moderator post (S3); `[Secondary]` launch OS (S2) |
| First stable build reported | `PD2352BF_EX_A_16.1.10.7.W30`, 2025-12-18 | `[Community report]` (S4) |
| Later moderator build | `PD2352BF_EX_A_16.1.12.0.W30` | `[Official]` (S3) |
| Security patch in moderator build | January 2026 | `[Official]` (S3) |
| Update size in moderator post | ~0.95 GB | `[Official]` (S3) |
| System rounded-corner setting | `Settings > Home screen, lock screen & wallpaper > System styles` | `[Official]` moderator post (S3) |
| Update cadence | Monthly security updates for Neo 10R | `[Official]` policy thread (S5) |

### 2.2 OriginOS 6 features relevant to media apps

- `[Official]` vivo's archived OriginOS 6 page describes Origin Island as a floating hub for real-time updates, suggestions, and status. (S6)
- `[Official]` The same page makes marketing claims about a “5-year smooth experience” and “ultra-long standby.” These are vendor claims, not technical guarantees for third-party background execution. (S6)
- `[Official]` The archived page does not document third-party foreground-service, media-notification, or background-execution behavior. (S6)
- `[Secondary]` OriginOS 6 exposes a Control Center media player option at `Settings > System management > Control center > Show media player`, with the subtitle “View and control media playback in Control center.” (S10)
- `[Secondary]` The Control Center's separate/merged layout can affect whether the media card is visible. (S10)
- `[Community report]` On the Neo 10R, the Origin Player / Origin Island media card reportedly supports only the default Music app and Spotify, not arbitrary third-party players. (S18, S23)
- `[Community report]` Users report that YouTube Music is not available in Origin Player, and the limitation has also been reported on other iQOO models. (S19)

### 2.3 What did not change

- `[Official]` Android 16 still requires a properly declared foreground service for continuous background playback; OriginOS 6 does not remove the AOSP foreground-service requirement. (S12, S13, S14)
- `[Official]` Android 13+ still requires `POST_NOTIFICATIONS` for a foreground-service notification to appear in the notification drawer, even though media-session notifications are exempt from the runtime-permission behavior change. (S12)
- `[Unverified]` OriginOS 6 may add OEM-specific visibility rules on top of AOSP; community reports below are the main evidence for that layer. (S18–S28)

---

## 3. Background and battery controls

### 3.1 Controls documented for OriginOS 6

| Control | Reported path | Behavior | Evidence |
|---|---|---|---|
| Background power control | `Settings > Battery > Background power control` | Policies described as smart / allow / restrict for background power | `[Secondary]` Cyber Raiden battery guide (S8) |
| Per-app battery usage | App info → Battery usage / battery settings | Choices described as Unrestricted / Optimized / Restricted | `[Secondary]` Cyber Raiden battery and apps guides (S8, S9) |
| Auto-start | Per-app controls in battery/app settings; older path `Settings > More settings > Applications > Autostart` | Allows an app to start or be started in the background | `[Secondary]` dontkillmyapp vivo page (S11); `[Secondary]` Cyber Raiden apps guide (S9) |
| High background power consumption | `Settings > Battery > High background power consumption` | Enabled apps may keep running in the background unless manually closed | `[Official]` iQOO Connect tip (S7) |
| Sleep standby optimization | `Settings > Battery > Sleep standby optimization` | Freezes idle apps and limits network switching during long standby | `[Secondary]` Cyber Raiden battery guide (S8) |
| Deep app optimization | Battery settings | Runs when the device is idle, charging, and screen-off | `[Secondary]` Cyber Raiden battery guide (S8) |
| Special app access | `Settings > Special app access` (label may vary) | Battery-optimization exceptions plus auto-start/background controls | `[Secondary]` Cyber Raiden battery guide (S8) |
| Control Center media player | `Settings > System management > Control center > Show media player` | Shows or hides the media player card in Control Center | `[Secondary]` Cyber Raiden system-management guide (S10) |

### 3.2 Important caveats about these paths

- `[Unverified]` The Cyber Raiden guides are OriginOS 6 walkthroughs, but they are not Neo 10R-specific. Labels and ordering can differ by region, model, and firmware build; verify each path on the unit. (S8–S10)
- `[Secondary]` The dontkillmyapp vivo page documents aggressive background killing and vendor-specific settings, but many of its paths date from older Funtouch/Android 13 builds. (S11)
- `[Unverified]` The 2022 iQOO “High background power consumption” tip predates OriginOS 6 and may not map one-to-one to the current UI. (S7)
- `[Secondary]` Autostart, battery-optimization exemption, and “high background power consumption” are separate controls. Enabling one does not guarantee the others. (S8, S9, S11)
- `[Unverified]` Clearing an app from Recents may change its process state and notification behavior on OriginOS 6; the March 2026 Neo 10R report suggests this is sometimes involved in media-notification recovery. (S22)

### 3.3 Candidate autostart intents — unverified on OriginOS 6

`[Unverified]` The following components are commonly cited in vivo/iQOO autostart workarounds. They are listed only as candidates for on-device resolution; do not hardcode them into production until they resolve and behave correctly on the Neo 10R.

| Candidate component | Status | Evidence |
|---|---|---|
| `com.iqoo.secure/com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity` | Candidate only | `[Unverified]` community workaround, not confirmed on OriginOS 6 |
| `com.iqoo.secure/com.iqoo.secure.ui.phoneoptimize.BgStartUpManager` | Candidate only | `[Unverified]` community workaround, not confirmed on OriginOS 6 |
| `com.vivo.permissionmanager/com.vivo.permissionmanager.activity.BgStartUpManagerActivity` | Candidate only | `[Unverified]` community workaround, not confirmed on OriginOS 6 |

- `[Unverified]` vivo does not publish a stable public autostart intent for third-party apps; package/activity names can change between OS builds. (S8, S11)
- `[Unverified]` The safe approach is to resolve the component with `cmd package resolve-activity` on the exact firmware and fall back to written manual instructions if it does not resolve. (S8, S11)

### 3.4 Practical user guidance (support copy)

- `[Secondary]` Tell users to set the app to **Unrestricted** battery usage if the option exists, and to allow **Auto-start** where the UI exposes it. (S8, S9, S11)
- `[Official]` Mention the **High background power consumption** screen only as an optional vivo tip, not as a requirement guaranteed to exist on every build. (S7)
- `[Unverified]` Do not promise that any single toggle prevents OEM killing; the controls interact and behavior can change after OS updates. (S8, S11)

---

## 4. Media notifications, foreground services, and the three media surfaces

`[Official]` Android has a standard media notification and lock-screen control surface; `[Community report]` OriginOS adds a separate Origin Player / Origin Island surface. The three should be tracked separately because they can behave differently:

| Surface | What it is | Who controls it | Evidence |
|---|---|---|---|
| Standard media notification | The `MediaStyle` notification in the notification shade, normally backed by the app's `MediaSession` | App via Media3/`MediaSession`; SystemUI renders it | `[Official]` Media3 (S16) |
| Lock-screen media controls | The media control panel on the lock screen, derived from the active media session | App via session metadata/actions; SystemUI renders it | `[Official]` Android/Media3 (S12, S16) |
| Origin Player / Origin Island card | vivo's own media card and island surface | vivo allowlist/system component; not a documented third-party API | `[Community report]` (S18–S23); `[Unverified]` mechanism |

### 4.1 AOSP and Media3 baseline

- `[Official]` A `MediaSessionService` automatically creates a `MediaNotification` that is a `MediaStyle` notification and stays updated from the media session. (S16)
- `[Official]` The notification is created once the player has media items; the notification cannot be removed while the foreground service is running. (S16)
- `[Official]` If playback is paused, stopped, or failed for more than 10 minutes without user interaction, the service transitions out of the foreground state and can be destroyed. (S16)
- `[Official]` Playback resumption after service death or reboot requires a `MediaButtonReceiver` and an implementation of `MediaSession.Callback.onPlaybackResumption()`. (S16)
- `[Official]` Android 13's `POST_NOTIFICATIONS` runtime permission exempts media-session notifications from the permission behavior change, but a foreground-service notification still needs the permission to appear in the notification drawer. (S12)
- `[Official]` Android 14 requires the `mediaPlayback` foreground-service type and the `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission. (S13)
- `[Official]` Android 15 applies 6-hour/24-hour limits to `dataSync` and `mediaProcessing` foreground services, but not to `mediaPlayback`; `BOOT_COMPLETED` cannot launch a `mediaPlayback` foreground service. (S14)
- `[Official]` Android 15 audio-focus requests require the app to be the top app or to be running a foreground service. (S14)
- `[Official]` Android 16 adjusts JobScheduler/WorkManager/DownloadManager quotas by standby bucket, top state, and concurrent foreground services. (S15)

### 4.2 OriginOS 6 behavior reported by users

- `[Community report]` Third-party players such as Metrolist, BitChord, and Echo Music can show media controls in the notification shade and on the lock screen, but do not appear in Origin Player / Origin Island. (S26–S28)
- `[Community report]` On the Neo 10R, Origin Player / Origin Island reportedly supports only the default Music app and Spotify. (S18, S23)
- `[Community report]` YouTube Music is specifically reported as unavailable in Origin Player. (S19)
- `[Community report]` A BitChord user reports that renaming the app's package makes it appear in vivo's media surface, which is consistent with package-name allowlisting. (S26)
- `[Community report]` SimpMusic maintainers document building a separate APK under `com.spotify.music` because vivo's island/widget follows allowlisted package names; the workaround cannot coexist with the real Spotify app and has separate data. (S29)
- `[Community report]` A March 2026 Neo 10R report describes Spotify, Poweramp, and VLC media notifications disappearing from the lock screen and notification panel after upgrading to OriginOS 6; Control Center prompted the user to install Origin Player, and a factory reset or clearing Spotify from Recents fixed some cases. (S22)
- `[Community report]` An October 2026 Neo 10R report repeats that Origin Island by default supports only the default music player and Spotify. (S23)
- `[Community report]` A Neo 7 Pro / OriginOS 6 report says MX Player Pro shows “Unknown song / Unknown artist,” while VLC displays metadata correctly. (S20)
- `[Community report]` A separate report says the Control Center media-player card disappears after stopping music and reappears when the app is reopened. (S21)

### 4.3 The `POST_NOTIFICATIONS` nuance on OriginOS

- `[Official]` AOSP exempts media-session notifications from the Android 13 runtime-permission change, but foreground-service notifications still need the permission to be visible in the drawer. (S12)
- `[Community report]` BoomingMusic issue #576 reports that removing `POST_NOTIFICATIONS` from the manifest disabled the media notification, and re-adding it fixed the issue. (S24)
- `[Community report]` Phocid issue #231 reports that on an iQOO Z9 Turbo running OriginOS, the media notification was invisible and the permission switch could not be opened unless the app declared `POST_NOTIFICATIONS`. (S25)
- `[Unverified]` These reports suggest OriginOS may require the permission for media notifications even where AOSP would exempt them; this is an OEM behavior, not a change to the Android contract. (S24, S25)
- `[Official]` Our app already declares `POST_NOTIFICATIONS` and requests it at runtime on Android 13+. (Repository: `AndroidManifest.xml`, `MainActivity.java`)

### 4.4 What the app can and cannot control

- `[Official]` The app can control the standard media notification and lock-screen controls through its `MediaSession`, metadata, and playback actions. (S16)
- `[Unverified]` We found no documented public API for a third-party app to opt into Origin Player / Origin Island; community evidence points to a package-name allowlist. (S26, S29)
- `[Unverified]` There may be a vivo partner/allowlist process, but no public documentation was found. (S18, S26, S29)
- `[Unverified]` Using a Spotify package name or undocumented `notification.superx.*` extras is not a supported integration. It creates install conflicts, splits app data, may break updates, and is not appropriate for production. (S26, S29, S30)
- `[Unverified]` Writing the undocumented `musicwidget_list_pkg_type_key` Settings key is not recommended; reading it for diagnostics is safe, but modifying it can produce unpredictable system state. (S18, S23)

---

## 5. Known bugs and failure modes

| # | Symptom | Device / OS | Reported behavior | Evidence | Practical impact |
|---|---|---|---|---|---|
| 1 | Media notifications vanish from lock screen and notification panel after OriginOS 6 upgrade | Neo 10R, OriginOS 6 | Spotify, Poweramp, and VLC affected; Control Center prompted to install Origin Player; factory reset or clearing Spotify from Recents fixed some cases | `[Community report]` (S22) | Total loss of visible controls in some states; needs on-device reproduction |
| 2 | Origin Island / Origin Player does not list third-party player | Neo 10R, OriginOS 6 | Only default Music and Spotify reported; YouTube Music unavailable | `[Community report]` (S18, S19, S23) | Island integration absent; standard notification may still work |
| 3 | Third-party players absent from island while shade/lock-screen controls work | Multiple vivo/iQOO devices | Metrolist, BitChord, Echo Music affected | `[Community report]` (S26–S28) | Indicates the island allowlist is separate from normal media controls |
| 4 | Metadata shows “Unknown song / Unknown artist” | Neo 7 Pro, OriginOS 6 | MX Player Pro affected; VLC displays correctly | `[Community report]` (S20) | `[Unverified]` Metadata pipeline or OEM media-card parsing issue; verify on Neo 10R |
| 5 | Control Center media card disappears after stopping playback | iQOO device, OriginOS 6 | Reopening the app restores the card | `[Community report]` (S21) | Cosmetic/state bug, not necessarily a service death |
| 6 | Media notification invisible after removing `POST_NOTIFICATIONS` | BoomingMusic, OriginOS | Re-adding the permission fixed it | `[Community report]` (S24) | Keep the permission declared and requested |
| 7 | Permission switch cannot be opened without declaring `POST_NOTIFICATIONS` | iQOO Z9 Turbo, OriginOS | Media notification invisible; permission UI broken | `[Community report]` (S25) | Declaration is required even if AOSP would exempt media sessions |
| 8 | Background playback killed or frozen during standby | vivo devices generally | Vendor battery manager can restrict background apps | `[Secondary]` (S11); `[Unverified]` for Neo 10R | Users may need battery/autostart changes; not independently measured here |
| 9 | Notification disappears after a long pause | AOSP/Media3 behavior | Service leaves foreground after 10 minutes paused/stopped/failed | `[Official]` (S16) | Expected behavior, not an OEM bug; implement resumption if desired |
| 10 | Notification cannot be swiped away while playing | AOSP/Media3 behavior | Foreground-service notification is ongoing | `[Official]` (S16) | Expected behavior; do not treat as a bug |

### 5.1 How to interpret the reports

- `[Unverified]` The March 2026 total-loss report is likely a separate state/permission/Control Center bug, not the same thing as the island allowlist. The October 2026 report describes the allowlist limitation while standard controls still work. (S22, S23)
- `[Community report]` The BitChord and SimpMusic workarounds show that package identity matters to vivo's media surface, but they do not prove that package renaming is stable across firmware updates. (S26, S29)
- `[Unverified]` The “Unknown song / Unknown artist” report may be specific to MX Player Pro's metadata or to the OEM card's parsing; it should not be generalized to all third-party players without a Neo 10R test. (S20)
- `[Official]` The 10-minute pause transition and the non-dismissible playing notification are documented Media3 behavior, not defects. (S16)

---

## 6. Current app implementation audit

### 6.1 Declared components and permissions

| Item | Current state | Evidence |
|---|---|---|
| Application ID | `com.ytmusic.app` | `[Official]` `android/app/build.gradle` |
| `minSdkVersion` / `targetSdkVersion` | 24 / 36 | `[Official]` `android/variables.gradle` |
| Media3 version | 1.3.1 (`media3-exoplayer`, `media3-datasource`, `media3-common`, `media3-session`) | `[Official]` `android/app/build.gradle` |
| Service | `.PlaybackService` extends `MediaSessionService` | `[Official]` `PlaybackService.java` |
| Service declaration | `android:foregroundServiceType="mediaPlayback"`, exported, `MediaSessionService` intent filter | `[Official]` `AndroidManifest.xml` |
| Permissions | `INTERNET`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` | `[Official]` `AndroidManifest.xml` |
| Runtime notification permission | Requested in `MainActivity` on Android 13+ | `[Official]` `MainActivity.java` |
| Media button receiver | Not declared | `[Official]` repository search |
| Boot receiver | Not declared | `[Official]` repository search |
| Playback resumption | Not implemented | `[Official]` repository search |

### 6.2 Notification implementation

- `[Official]` `PlaybackService` creates a notification channel `rem_playback_channel` with `IMPORTANCE_LOW`, badge disabled, and public lock-screen visibility. (Repository: `PlaybackService.java`)
- `[Official]` In `onCreate()`, it calls `startForegroundNotification("Rem", "Ready to play", false)` before creating the player and media session. (Repository: `PlaybackService.java`)
- `[Official]` The manual notification uses `NotificationCompat`, notification ID `1001`, small icon `R.mipmap.ic_launcher`, previous/play-pause/next actions via `PendingIntent.getService`, public visibility, and low priority. (Repository: `PlaybackService.java`)
- `[Official]` The manual notification does **not** use `NotificationCompat.MediaStyle`, does **not** attach a media-session token, and the service does **not** call `setMediaNotificationProvider`. (Repository: `PlaybackService.java`)
- `[Official]` The manual notification is rebuilt on player state changes such as `onPlaybackStateChanged`, `onIsPlayingChanged`, and `onPlayerError`. (Repository: `PlaybackService.java`)
- `[Official]` `ExoPlayer` is configured with `C.WAKE_MODE_NETWORK`, music audio attributes, and automatic audio-focus handling. (Repository: `PlaybackService.java`)
- `[Official]` The service creates a `MediaSession` with `setSessionActivity(...)` and returns it from `onGetSession(...)`. (Repository: `PlaybackService.java`)

### 6.3 The notification-ID collision

- `[Official]` Media3's `DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID` is `1001`, and its default channel ID is `default_channel_id`. (S17)
- `[Official]` Our manual notification also uses ID `1001`. (Repository: `PlaybackService.java`)
- `[Unverified]` Because both use the same notification ID, the notification visible at any moment depends on which component posted last: Media3's automatic `MediaStyle` notification or our manual plain notification. This is replacement, not two simultaneous notifications. (S16, S17; repository)
- `[Unverified]` Our service calls `startForegroundNotification(...)` on player state changes after Media3 has likely posted its own notification. If the manual call runs last, it can replace the `MediaStyle` notification with a plain notification that has no session token and no artwork. This is a plausible cause of OEM media-surface misclassification and should be verified with `dumpsys notification`. (S16, S17; repository)

### 6.4 Architecture gaps relative to Media3 guidance

- `[Official]` Media3 automatically provides and owns a media notification through its `MediaNotification.Provider`; the current service also manages a separate manual notification. (S16, S17)
- `[Official]` The current service has no `MediaButtonReceiver`, so playback resumption from Bluetooth/System UI after service death or reboot is not available. (S16; repository)
- `[Official]` The current service has no `onPlaybackResumption` implementation, so it cannot restore a playlist and position after service death/reboot. (S16; repository)
- `[Official]` The app targets API 36; Android 15/16 foreground-service and job-quota rules apply during testing. (Repository: `variables.gradle`; S14, S15)
- `[Official]` Android notification small icons are expected to be simple monochrome assets; the launcher mipmap used here is not designed for that role. (S32) `[Unverified]` It may render poorly in the status bar on some OEM builds, which is a quality issue rather than a functional blocker. (Repository)

---

## 7. ADB verification playbook

These commands are read-only diagnostics. Run them against a debug build on the target Neo 10R with USB debugging enabled. On Windows PowerShell, pipe `adb shell` output through `Select-String`; on macOS/Linux, use `grep`.

### 7.1 Preconditions

- `[Official]` Enable Developer options and USB debugging, then confirm the device with `adb devices`. (Android platform tooling)
- `[Official]` Use a debug build or a test account; `dumpsys notification --noredact` can expose notification content. (Android platform tooling)
- `[Unverified]` Do not use `settings put` on the undocumented island keys during diagnosis; read-only inspection is sufficient and safer.

### 7.2 Core commands

| Purpose | Command | What to look for |
|---|---|---|
| Confirm device connection | `adb devices` | Device serial listed as `device`, not `unauthorized` |
| Inspect active media session | `adb shell dumpsys media_session` | Package `com.ytmusic.app`, playback state, metadata, actions, active session |
| Inspect foreground service | `adb shell dumpsys activity services com.ytmusic.app` | `isForeground=true`, `foregroundServiceType=mediaPlayback`, service lifetime |
| Inspect notification records | `adb shell "dumpsys notification --noredact" \| Select-String -Pattern "com.ytmusic.app","MediaStyle","rem_playback_channel","default_channel_id","1001"` | Which channel/ID is present; whether `MediaStyle` and a session token are attached |
| Check notification permission | `adb shell cmd appops get com.ytmusic.app POST_NOTIFICATION` | `allow` vs `ignore`; compare with the in-app permission state |
| Check battery-optimization exemption | `adb shell dumpsys deviceidle whitelist \| Select-String com.ytmusic.app` | Package present or absent |
| Check standby bucket | `adb shell am get-standby-bucket com.ytmusic.app` | `active`, `working_set`, `frequent`, `rare`, or `restricted` |
| Check process state | `adb shell dumpsys activity processes \| Select-String -Pattern "com.ytmusic.app","oom_adj"` | Whether the process is cached, foreground-service, or persistent |
| Check process death reasons | `adb shell dumpsys activity exit-info com.ytmusic.app` | Recent exit reason, timestamp, and description |
| Inspect island allowlist key (unverified) | `adb shell settings get system musicwidget_list_pkg_type_key` | `null` or a package list; do not modify |
| Resolve candidate autostart activity | `adb shell cmd package resolve-activity --brief com.iqoo.secure/com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity` | Resolved component or “No activity found” |
| Resolve alternate autostart activity | `adb shell cmd package resolve-activity --brief com.vivo.permissionmanager/com.vivo.permissionmanager.activity.BgStartUpManagerActivity` | Resolved component or “No activity found” |
| Inspect notification channel | `adb shell "dumpsys notification --noredact" \| Select-String -Pattern "rem_playback_channel","default_channel_id"` | Channel importance, visibility, and whether both channels exist |

### 7.3 Suggested test sequence

1. `[Official]` Launch the app, start playback, and capture `dumpsys media_session`, `dumpsys activity services`, and `dumpsys notification` while the app is foregrounded. (S16; repository)
2. `[Official]` Press Home, turn the screen off, wait 30 seconds, and repeat the captures. Confirm the service remains foreground and the media session remains active. (S14, S16)
3. `[Official]` Pause for 11 minutes and repeat. Media3 should transition out of foreground after 10 minutes; note whether the notification disappears or remains stale. (S16)
4. `[Community report]` Open Control Center and the lock screen; record whether the standard media card appears, whether Origin Player/Origin Island appears, and whether Control Center prompts to install Origin Player. (S22, S23)
5. `[Official]` Revoke `POST_NOTIFICATIONS` with `adb shell cmd appops set com.ytmusic.app POST_NOTIFICATION ignore` (debug device only), restart playback, and note whether the media notification/lock-screen controls disappear. Re-grant afterwards. (S12, S24, S25)
6. `[Official]` Reboot the device and check whether a resumption notification appears; the current app has no `MediaButtonReceiver`/`onPlaybackResumption`, so it should not. (S16; repository)
7. `[Community report]` Reproduce the March 2026 failure state if possible: upgrade path, Control Center prompt, clearing from Recents, and factory reset are all variables. Record the build string and whether the issue persists. (S22)
8. `[Unverified]` Check the standby bucket before and after screen-off/standby to see whether OriginOS demotes the app. (S11)

### 7.4 Logcat filter

```powershell
adb logcat -v time | Select-String -Pattern "com.ytmusic.app|PlaybackService|MediaSession|MediaSessionService|NotificationService|OriginPlayer|OriginOS|ActivityManager|FATAL EXCEPTION"
```

- `[Official]` `PlaybackService` logs lifecycle and error messages under the `PlaybackService` tag. (Repository)
- `[Unverified]` OriginOS-specific logs may use different tags; search for `Origin`, `vivo`, and `iqoo` if the above filter is too narrow. (S22)

### 7.5 What the diagnostics can and cannot prove

- `[Official]` `dumpsys media_session` proves whether a session exists and what metadata/actions it exposes; it does not prove that a particular OEM surface will render it. (S16)
- `[Official]` `dumpsys notification` proves which notification ID, channel, and style are posted; it does not prove why a vendor surface ignores them. (S17)
- `[Unverified]` The `musicwidget_list_pkg_type_key` value is not an official API and may be absent or stale; absence does not prove the device has no allowlist. (S18, S23)
- `[Unverified]` `cmd package resolve-activity` proves only that a component exists; it does not prove the activity is safe to deep-link or that it performs the expected action. (S8, S11)

---

## 8. What this means for our media app

**Phase note:** Phase 0 is on-device verification and evidence capture. Phase 1 (design/approval) is not detailed here. Phase 2 is the implementation pass that follows a confirmed diagnosis.

### 8.1 Phase 0 — verify before changing behavior

1. **Capture the current notification ownership.** `[Official]` Our service manually posts notification ID `1001`; Media3's default provider also uses `1001`. (S17; repository) Determine whether the visible notification is the manual plain notification or Media3's `MediaStyle` notification. Use `dumpsys notification --noredact` and look for `MediaStyle`, the session token, and the channel ID.
2. **Verify the media session independently of the notification.** `[Official]` Check `dumpsys media_session` for an active `com.ytmusic.app` session, correct metadata, and play/pause/next/previous actions. (S16) If the session is healthy but the shade/lock screen is blank, the problem is in the OEM notification surface, not the player.
3. **Test the permission edge case.** `[Official]` Confirm `POST_NOTIFICATIONS` is granted, then test denial on a debug device. (S12) `[Community report]` OriginOS has been reported to hide media notifications when the permission is missing, despite AOSP's media-session exemption. (S24, S25)
4. **Separate the three surfaces in bug reports.** `[Official]` Record standard notification, lock-screen controls, and Origin Player/Origin Island separately. (S16) `[Community report]` They can diverge on this device. (S22, S23)
5. **Map the actual battery/autostart UI on the unit.** `[Unverified]` Resolve the candidate autostart intents and record the real labels/paths for the installed build. (S8, S11) Do not ship hardcoded intents until they resolve and behave correctly.
6. **Check the island allowlist without modifying it.** `[Unverified]` Read `musicwidget_list_pkg_type_key` and observe whether `com.ytmusic.app` appears. (S18, S23) Treat absence as expected for a non-allowlisted app, not as an app bug.
7. **Reproduce the 10-minute pause and reboot cases.** `[Official]` Media3 leaves foreground after 10 minutes paused; the current app has no resumption path. (S16; repository) Decide whether resumption is a product requirement before implementing it.
8. **Collect vendor evidence for the March 2026 failure state.** `[Community report]` If a user reports total notification loss, capture the build string, Control Center prompt, Recents state, and whether a factory reset changes it. (S22) Do not assume the island allowlist explains every report.

### 8.2 Phase 2 — implementation recommendations

1. **Let Media3 own the media notification.** `[Official]` Remove the repeated manual `startForegroundNotification(...)` calls from player-state listeners and rely on Media3's `MediaNotification.Provider`/`MediaStyle` notification. (S16, S17; repository) If an immediate foreground notification is required before a media item exists, post a one-time placeholder and stop updating it so Media3 can replace it cleanly.
2. **Configure the Media3 provider explicitly.** `[Official]` Use `DefaultMediaNotificationProvider.Builder` to set a stable channel ID, channel name, and notification ID, and set a proper monochrome small icon. (S17) This removes ambiguity about which channel and icon the user sees.
3. **Keep the notification ID unique to Media3.** `[Official]` Do not reuse `1001` for a separate plain notification; Media3's default provider uses that ID. (S17) Reusing it causes replacement races and makes `dumpsys` diagnosis ambiguous.
4. **Add `MediaButtonReceiver` and playback resumption.** `[Official]` Declare `androidx.media3.session.MediaButtonReceiver` and implement `MediaSession.Callback.onPlaybackResumption(...)` so Bluetooth/System UI can resume after service death or reboot. (S16) This is the documented Media3 path for resumption.
5. **Keep `POST_NOTIFICATIONS` declared and requested.** `[Official]` The app already does this. (Repository; S12) Add a user-facing explanation if the permission is denied, because OriginOS reports show media notifications can be hidden without it. (S24, S25)
6. **Respect the 10-minute foreground-service transition.** `[Official]` Do not fight the documented paused/stopped timeout; use resumption or a user-visible “paused” state instead. (S16) If the product needs long-lived pause behavior, design it explicitly rather than holding an FGS indefinitely.
7. **Do not start a `mediaPlayback` FGS from `BOOT_COMPLETED`.** `[Official]` Android 15 prohibits this; use a resumption notification or wait for user action. (S14) The current app has no boot receiver, so this is already aligned. (Repository)
8. **Test Android 16 job and FGS quotas.** `[Official]` Validate that playback, downloads, and any `WorkManager` jobs behave under top-app, foreground-service, and restricted-bucket conditions. (S15) Use the documented quota-override test commands only on test devices. (S15)
9. **Treat Origin Player/Origin Island as an unsupported surface.** `[Community report]` Third-party apps are not documented as allowlistable, and the Neo 10R reports limit the island to the default Music app and Spotify. (S18, S19, S23) Ship standard notification/lock-screen support and set expectations in the UI; do not promise island integration.
10. **Do not ship package-name spoofing or undocumented extras.** `[Community report]` BitChord and SimpMusic workarounds demonstrate the allowlist, but they create install conflicts and split data. (S26, S29) `[Unverified]` `notification.superx.*` extras and `musicwidget_list_pkg_type_key` writes are undocumented and unsafe for production. (S18, S23)
11. **Provide a battery/autostart onboarding path with manual fallbacks.** `[Secondary]` Link only to activities that resolve on the current build; otherwise show written steps for Battery optimization, Auto-start, and High background power consumption. (S8, S9, S11) `[Official]` Keep the wording conditional because these screens vary by build. (S7)
12. **Add regression coverage for the OEM failure matrix.** `[Official]` Test foreground, background, screen-off, 11-minute pause, permission denied, battery saver, restricted bucket, reboot, Bluetooth media buttons, and Control Center/lock-screen surfaces. (S14, S16) `[Community report]` Include the March 2026 total-loss state and the “card disappears after stop” state. (S21, S22)
13. **Re-evaluate the pinned Media3 version.** `[Official]` The app pins Media3 1.3.1. (Repository) Review a current Media3 release for notification/resumption fixes, but treat the upgrade as a separate change with its own regression pass. (S16)
14. **Use a proper notification small icon and artwork path.** `[Official]` The current manual notification uses the launcher mipmap and no artwork; Media3's provider supplies a media small icon and artwork from metadata. (Repository; S17) Moving to Media3's provider resolves both quality issues.
15. **Instrument the diagnosis in debug builds.** `[Unverified]` Add a debug-only diagnostics screen or log dump that records notification ID/channel, media-session state, FGS state, permission state, and standby bucket. This shortens future OEM investigations without changing production behavior. (S12, S16, S17)

### 8.3 Explicit non-goals

- `[Unverified]` Do not rename `com.ytmusic.app` to `com.spotify.music` or another allowlisted package. The workaround is brittle, conflicts with the real app, and is not a supported vivo integration. (S26, S29)
- `[Unverified]` Do not write `musicwidget_list_pkg_type_key` or `notification.superx.*` values from the app. They are undocumented and may break after an OS update. (S18, S23)
- `[Unverified]` Do not promise Origin Island support in marketing or onboarding until vivo documents a third-party API or the app is formally allowlisted. (S18, S23)

---

## 9. Questions answerable only on-device

These require a Neo 10R running the user's exact OriginOS 6 build:

1. Which notification is actually visible during playback: the manual `rem_playback_channel` notification or Media3's `default_channel_id` `MediaStyle` notification? Does the visible notification change when pausing/resuming?
2. Does `dumpsys notification --noredact` show one active ID `1001` notification or two? Which one has the `MediaStyle` style and session token?
3. Does `dumpsys media_session` show a healthy `com.ytmusic.app` session with correct title, artist, artwork URI, and play/pause/next/previous actions?
4. Do lock-screen controls appear with the screen off, and do they still work after 10+ minutes paused?
5. Does denying `POST_NOTIFICATIONS` hide the media notification or lock-screen controls on this build? Does the permission switch open correctly?
6. Does Origin Player / Origin Island list `com.ytmusic.app`? If not, does Control Center show the standard media card, and does it prompt to install Origin Player?
7. What does `settings get system musicwidget_list_pkg_type_key` return? Does it contain `com.ytmusic.app` or only allowlisted packages?
8. Which of the candidate autostart components resolve on this build: `AddWhiteListActivity`, `BgStartUpManager`, or `BgStartUpManagerActivity`? What are the actual on-screen labels?
9. What standby bucket does `am get-standby-bucket com.ytmusic.app` report before and after screen-off/standby? Does the app get killed, and what does `dumpsys activity exit-info` say?
10. Does the March 2026 total-loss bug reproduce on the installed build? If so, does clearing the app from Recents, resetting permissions, or a factory reset change it?
11. Does the Control Center media card disappear after stopping playback, and does reopening the app restore it?
12. Does Bluetooth/AVRCP show the correct title/artist and respond to play/pause/next/previous?
13. Does reboot produce a media resumption notification? (The current app has no resumption path, so the expected answer is no.)
14. Does the device show “Unknown song / Unknown artist” for any of our test tracks, or is metadata correct in both the standard notification and the OEM card?
15. Does the visible notification change after an OriginOS 6 update? Record the build string before and after.

---

## 10. Sources

All sources were accessed on **2026-11-05**. Reddit pages returned HTTP 403 or empty content during retrieval; their details are treated as community summaries and are not quoted verbatim.

### 10.1 Official / first-party

- **S1** — iQOO India, iQOO Neo 10R product page: <https://www.iqoo.com/in/products/neo10r> `[Official]`
- **S3** — iQOO Community, moderator update thread (build `PD2352BF_EX_A_16.1.12.0.W30`, Android 16, January 2026 patch): <https://community.iqoo.com/in/thread/132664> `[Official]`
- **S5** — iQOO Community, update-policy thread listing Neo 10R under monthly security updates: <https://community.iqoo.com/in/thread/100192> `[Official]`
- **S6** — Archived vivo OriginOS 6 page (Origin Island, “5-year smooth experience,” “ultra-long standby”): <https://web.archive.org/web/20251201014110/https://www.iqoo.com/in/originos> `[Official]`
- **S7** — iQOO Connect, “High background power consumption” tip (2022): <https://community.iqoo.com/in/thread/13201> `[Official]`
- **S12** — Android Developers, notification runtime permission (Android 13): <https://developer.android.com/develop/ui/views/notifications/notification-permission> `[Official]`
- **S13** — Android Developers, foreground-service types / media playback (Android 14): <https://developer.android.com/about/versions/14/changes/fgs-types-required#media-playback> `[Official]`
- **S14** — Android Developers, Android 15 behavior changes (FGS timeouts, `BOOT_COMPLETED`, audio focus): <https://developer.android.com/about/versions/15/behavior-changes-15> `[Official]`
- **S15** — Android Developers, Android 16 JobScheduler/WorkManager/DownloadManager quota changes: <https://developer.android.com/about/versions/16/changes/job-scheduler-quotas> `[Official]`
- **S16** — Android Developers, Media3 background playback and `MediaSessionService` notification lifecycle: <https://developer.android.com/media/media3/session/background-playback> `[Official]`
- **S17** — AndroidX Media3 1.3.1 source, `DefaultMediaNotificationProvider` (`DEFAULT_NOTIFICATION_ID = 1001`, `DEFAULT_CHANNEL_ID = "default_channel_id"`): <https://raw.githubusercontent.com/androidx/media/1.3.1/libraries/session/src/main/java/androidx/media3/session/DefaultMediaNotificationProvider.java> `[Official]`

### 10.2 Secondary

- **S2** — GSMArena, vivo iQOO Neo 10R specifications: <https://www.gsmarena.com/vivo_iqoo_neo_10r-13682.php> `[Secondary]`
- **S8** — Cyber Raiden, “OriginOS 6 Battery Section Settings Explained”: <https://cyberraiden.com/2026/09/10/origin-os-6-battery-section-settings-explained/> `[Secondary]`
- **S9** — Cyber Raiden, “OriginOS 6 Apps Section Settings Explained”: <https://cyberraiden.com/2026/08/02/origin-os-6-apps-section-settings-explained/> `[Secondary]`
- **S10** — Cyber Raiden, “OriginOS 6 System Management Section Settings Explained”: <https://cyberraiden.com/2026/09/15/origin-os-6-system-management-section-settings-explained/> `[Secondary]`
- **S11** — dontkillmyapp.com, vivo: <https://dontkillmyapp.com/vivo> `[Secondary]`

### 10.3 Community reports

- **S4** — iQOO Community, Neo 10R OriginOS 6 rollout report (build `PD2352BF_EX_A_16.1.10.7.W30`, 2025-12-18): <https://community.iqoo.com/in/thread/138578> `[Community report]`
- **S18** — iQOO Community, Origin Player supports only Spotify/default Music: <https://community.iqoo.com/in/thread/161027> `[Community report]`
- **S19** — iQOO Community, YouTube Music unavailable in Origin Player: <https://community.iqoo.com/in/thread/147030> `[Community report]`
- **S20** — iQOO Community, MX Player Pro “Unknown song / Unknown artist” on Neo 7 Pro / OriginOS 6: <https://community.iqoo.com/in/thread/152961> `[Community report]`
- **S21** — iQOO Community, Control Center media card disappears after stopping playback: <https://community.iqoo.com/in/thread/124796> `[Community report]`
- **S22** — Reddit r/neo10R, March 2026 media-notification regression report: <https://www.reddit.com/r/neo10R/comments/1ripi1t> `[Community report]`
- **S23** — Reddit r/neo10R, October 2026 Origin Island allowlist report: <https://www.reddit.com/r/neo10R/comments/1xdogxp> `[Community report]`
- **S24** — BoomingMusic issue #576, media notification disabled when `POST_NOTIFICATIONS` removed: <https://github.com/mardous/BoomingMusic/issues/576> `[Community report]`
- **S25** — Phocid issue #231, iQOO Z9 Turbo / OriginOS media notification and permission switch: <https://github.com/TJYSunset/Phocid/issues/231> `[Community report]`
- **S26** — BitChord issue #462, third-party app absent from vivo media surface; package rename workaround: <https://github.com/kushagrasinghx/BitChord/issues/462> `[Community report]`
- **S27** — Metrolist issue #4468, vivo media surface omission: <https://github.com/MetrolistGroup/Metrolist/issues/4468> `[Community report]`
- **S28** — Echo Music issue #621, vivo media surface omission: <https://github.com/EchoMusicApp/Echo-Music/issues/621> `[Community report]`
- **S29** — SimpMusic issue #2653, separate APK under `com.spotify.music` for vivo island/widget: <https://github.com/maxrave-dev/SimpMusic/issues/2653> `[Community report]`
- **S30** — Spotilol pull requests #12, #13, #14, community package/allowlist experiments: <https://github.com/Ryd127/Spotilol/pull/12> `[Community report]`

### 10.4 Repository evidence

- `android/app/src/main/AndroidManifest.xml` — permissions and `.PlaybackService` declaration.
- `android/app/src/main/java/com/ytmusic/app/PlaybackService.java` — notification channel, manual notification, MediaSession, ExoPlayer configuration.
- `android/app/src/main/java/com/ytmusic/app/MainActivity.java` — runtime `POST_NOTIFICATIONS` request.
- `android/app/build.gradle` — `applicationId "com.ytmusic.app"`, Media3 1.3.1.
- `android/variables.gradle` — `minSdkVersion = 24`, `targetSdkVersion = 36`.

---

## 11. Final assessment

- `[Official]` The Neo 10R is a recent, supported iQOO device with monthly security updates and OriginOS 6 / Android 16. (S3, S5)
- `[Community report]` Its Origin Player / Origin Island surface is not a general-purpose third-party media API; on the Neo 10R it is reported to support only the default Music app and Spotify. (S18, S23)
- `[Official]` Standard `MediaSession` notifications and lock-screen controls are the correct integration surface for our app. (S16)
- `[Official]` Our current service's manual plain notification reuses Media3's notification ID and is rebuilt after Media3 posts, so the visible notification may not be the Media3 `MediaStyle` one. (S17; repository)
- `[Unverified]` Fixing that ownership issue, keeping `POST_NOTIFICATIONS`, adding resumption, and testing the OEM failure matrix are the highest-value Phase 2 changes. (S12, S16, S17, S24, S25)
- `[Unverified]` Package spoofing and undocumented Settings keys are not acceptable production mitigations. (S26, S29)
