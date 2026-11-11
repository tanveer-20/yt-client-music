# finalTarget — Full BitChord-Parity Rewrite Plan

**Project:** Rem (`yt-client-music`)
**Target:** [kushagrasinghx/BitChord](https://github.com/kushagrasinghx/BitChord) — UI and behavior
**Status:** Approved plan, ready to execute
**Mode:** Greenfield rewrite of the app layer. Old UI/stores/hooks are deleted, not adapted.

---

## 0. Mission

Rebuild Rem from the ground up so that it matches BitChord:

- **UI:** Apple Music-inspired web player replicated from BitChord's measured design system — layout, type scale, colors, glass materials, motion, skeletons, artwork tinting, responsive behavior.
- **Working:** the full feature set — YouTube Music browse/search/play with high-quality direct streaming where possible, queue and gapless/crossfade playback, synced lyrics, accounts/library, addon sources, Spotify/Discord integrations, Listen Together, Replay, and Automix.
- **Architecture:** BitChord's web architecture where it makes sense (direct SABR streaming + companion extension), with a proxy engine kept for the Capacitor Android app and as a fallback.

**Non-goals (matching BitChord web):** PWA/service worker, audio/API proxy as the primary web path, downloads on web, casting, DSD/AC-4/E-AC-3, Safari extension, native TV/Wear apps.

---

## 1. What "BitChord" means as the target

### 1.1 UI target

Measured from `web/docs/apple-music-dom.md` and `web/app/src/styles/tokens.css`:

| Area | Target |
|---|---|
| Type | DM Sans everywhere; 34/40, 26/32, 22/26, 17/22, 15/20, 13/16 scale |
| Colors | Light `--keyColor #d60017`; dark `--keyColor #fa586a`; dark page `#1f1f1f`; full Apple semantic token set |
| Layout | Sidebar 260px; body gutter 25px → 40px ≥1000px; player pill 56px; side panel 300px; mobile top bar 52px; mini player 52px |
| Radii | Artwork 5/7/10px; nav item 8px; track row 6px; pill 1000px |
| Motion | Panel easing `cubic-bezier(0.215, 0.61, 0.355, 1)`, 0.3s; no bouncy easing |
| Surfaces | Glass material `saturate(220%) blur(16px)`; artwork-driven page tint; mesh gradient backdrop; skeleton shimmer |
| Modes | System light/dark; increased contrast; reduced motion; `[data-full-screen]` always on-dark |

### 1.2 Feature target (BitChord web + spec)

- Browse home shelves, search with suggestions, album, artist, playlist, library.
- YouTube playback via SABR when the extension is present; proxy fallback otherwise.
- Queue with shuffle/repeat/radio/autoplay, Up Next panel, gapless + crossfade 0–12s.
- Synced lyrics from a provider chain, rendered with am-lyrics and a steered clock.
- YouTube sign-in via extension cookies; library/likes/history.
- Addon HTTP sources (lossless/DASH).
- Spotify import + Canvas; Discord rich presence.
- Listen Together party sync.
- Replay listening stats.
- Automix beat-matched transitions.
- Companion MV3 extension for headers, CORS, cookies and integrations.

### 1.3 Reference discipline (GPLv3)

BitChord is **GPLv3**. We are doing a **clean-room reimplementation**:

- Read BitChord's docs, Kotlin and TS code to understand behavior; write our own code.
- Do **not** copy files, comments or docs verbatim.
- Design values are measurements/facts; re-derive them into our own token schema.
- Do not use BitChord logos, branding, artwork or font files.
- `am-lyrics` is an MPL-2.0 dependency — allowed as a dependency; any patched file stays MPL-2.0.
- If we ever port GPL code verbatim, Rem becomes GPLv3 on distribution. Avoid it.

---

## 2. Decisions locked

| Decision | Choice |
|---|---|
| Approach | Clean-room reimplementation; BitChord as behavioral spec |
| Design system | Adopt BitChord's Apple Music token system exactly; drop red/OLED/Midnight Navy identity |
| Playback | **Hybrid:** SABR + extension on desktop web; yt-dlp proxy on Capacitor and as fallback |
| Scope | Full app — all workstreams below |
| Rewrite style | Greenfield `src/`; delete old components/stores/hooks/utils |
| Branching | Work on `rewrite` branch; `main` preserves the old implementation |
| Android | Capacitor wrapper retained; proxy engine is the Android playback path |
| Backend | Existing Express server retained and rebuilt into proxy engine + catalog transport |
| Extension | New in-repo MV3 package (WXT), Chrome/Firefox targets |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ UI: React 19 + React Router data router + TanStack Query     │
│ BitChord Apple Music tokens, shell, pages, skeletons         │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
     ┌──────────▼──────────┐        ┌──────────▼──────────┐
     │ Catalog transport   │        │ PlaybackEngine      │
     │ ├ Proxy InnerTube   │        │ ├ ProxyEngine       │
     │ └ Extension InnerTube│       │ │ (Express + yt-dlp)│
     └──────────┬──────────┘        │ └ SabrEngine        │
                │                   │   (youtubei.js +    │
                │                   │    BgUtils +        │
                │                   │    googlevideo +    │
                │                   │    Shaka)           │
                │                   └──────────┬──────────┘
                │                              │
     ┌──────────▼──────────────────────────────▼──────────┐
     │ Shared player core: Zustand state machine, queue    │
     │ builder/timeline, Media Session, history, crossfade │
     └──────────┬──────────────────────────────┬──────────┘
                │                              │
   ┌────────────▼───────────┐      ┌───────────▼───────────┐
   │ Lyrics                  │      │ Social / extras        │
   │ provider chain → TTML   │      │ Addons, Spotify,       │
   │ → am-lyrics + clock     │      │ Discord, Party, Replay │
   └─────────────────────────┘      │ Automix                │
                                    └────────────────────────┘
```

### 3.1 Two abstractions that make the hybrid work

1. **Catalog transport**
   - `proxy`: InnerTube calls through the Express server. Works on web, Capacitor, and anywhere without the extension.
   - `extension`: direct InnerTube via the browser extension. Used on desktop when installed, and required for signed-in calls.
   - Both return the same mapped domain types.

2. **Playback engine**
   - `ProxyEngine`: yt-dlp audio via the Express server. Capacitor's path; universal fallback.
   - `SabrEngine`: browser-direct SABR/UMP with PO tokens and Shaka. Desktop web when the extension is present.
   - Selection: extension detected → SABR; proxy reachable → proxy; otherwise BitChord-style install/setup banners.

The queue, player state, Media Session, history and UI are engine-agnostic.

### 3.2 BitChord playback engine (reference behavior)

**Web (`playback/youtube/*`):**
1. `youtubei.js` builds InnerTube requests (WEB_REMIX context, visitor data, client versions).
2. `BgUtils` runs BotGuard in the browser to mint PO tokens; cached per session/visitor.
3. `googlevideo` opens a SABR/UMP session from the player response.
4. Shaka Player plays audio-only with a custom UMP scheme. Prefer Opus itag 251, fall back to AAC 140.
5. On 403/bot-check/missing format, retry with other InnerTube clients and refresh the PO token.
6. Web Audio graph for volume, crossfade and EQ. `hls.js` for addon HLS; `<audio>` for progressive addon URLs.
7. The extension rewrites `Origin`/`Referer` and adds CORS response headers via `declarativeNetRequest`; signed-in calls run in the worker with cookies + `SAPISIDHASH`.
8. Automix: `essentia.js`/`onnxruntime-web` analysis + `signalsmith-stretch`.

**Android (Kotlin reference):** Media3/ExoPlayer + InnerTubeX resolver + addons; FLAC/ALAC, gapless/crossfade, bit-perfect USB. Not reusable from React; informs behavior only.

---

## 4. New repository layout

```
yt-client-music/
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx                     # router + providers
│  ├─ routes.tsx                  # lazy route registry
│  ├─ config.ts
│  ├─ styles/
│  │  ├─ tokens.css               # Apple Music token set (ours)
│  │  └─ global.css
│  ├─ shell/                      # AppShell, Sidebar, PlayerBar, FullScreenPlayer,
│  │                              # UpNext, SidePanel, MeshBackdrop, MobileTopBar,
│  │                              # VolumeControl, NerdStats, account, banners,
│  │                              # keyboard shortcuts, wheel volume, scrubber
│  ├─ pages/                      # Home, Search, Album, Artist, Playlist, Library,
│  │                              # Settings, Extension, Spotify, ListenTogether,
│  │                              # Discord, Debug, NotFound
│  ├─ components/
│  │  ├─ music/                   # Artwork, Lockups, ShelfView, DetailHeader,
│  │  │                          # TrackList, CategoryTiles, SearchField, badges,
│  │  │                          # FavoriteButton, TrackMenu, States
│  │  ├─ common/                  # Menu, Select, PageHeader, PrefetchLink
│  │  └─ icons/                   # nav + transport icons
│  ├─ skeletons/                  # PageSkeletons, ShelfSkeleton, DetailSkeleton
│  ├─ data/
│  │  ├─ music/                   # api, queries, mappers, types
│  │  ├─ match/                   # track matching (addons/Spotify)
│  │  └─ spotify/                 # import queries, canvas
│  ├─ playback/
│  │  ├─ engine.ts                # PlaybackEngine interface + selection
│  │  ├─ proxy/                   # ProxyEngine (server client, preload, failover)
│  │  ├─ sabr/                    # innertube, resolver, botguard, shaka adapter
│  │  ├─ queue/                   # builder, timeline
│  │  ├─ mediaSession.ts
│  │  ├─ history.ts
│  │  └─ automix/                 # analysis worker, deck engine, transitions
│  ├─ lyrics/                     # providers, parse, ttml, clock, repository, settings, useLyrics
│  ├─ party/                      # listen together client, clock, models, hooks
│  ├─ replay/                     # IndexedDB buckets, recorder, stories, poster
│  ├─ bridge/                     # page <-> extension contract (shared with extension)
│  ├─ state/                      # player.ts, ui.ts
│  └─ lib/                        # artwork, color/tint, palette, platform, queryClient
├─ extension/                     # WXT MV3 workspace (Chrome + Firefox)
├─ packages/
│  └─ bridge/                     # optional shared package if extension imports diverge
├─ server/                        # Express: yt-dlp proxy + InnerTube catalog proxy
├─ android/                       # Capacitor Android (kept)
├─ fixtures/                      # captured InnerTube/addon/lyrics responses
├─ docs/                          # our own architecture + fixtures docs
├─ public/
├─ capacitor.config.ts
├─ vite.config.ts
├─ package.json                   # React 19, Router, Query, Zustand, Tailwind v4, Shaka, etc.
└─ finalTarget.md                 # this plan
```

---

## 5. Deleted vs preserved

### 5.1 Deleted / replaced

| Removed | Replaced by |
|---|---|
| `src/components/**` | `src/shell/`, `src/pages/`, `src/components/music/` |
| `src/stores/*` | `src/state/player.ts`, `src/state/ui.ts`, TanStack Query |
| `src/hooks/useAudioPlayer.ts`, `useKeyboardShortcuts.ts` | `src/playback/engine.ts`, `src/shell/useKeyboardShortcuts.ts` |
| `src/utils/{api,streamResolver,mediaSession,audioEnhancer,format}.ts` | `src/data/music/`, `src/playback/*`, `src/lib/` |
| Zustand view switching | React Router data router + lazy routes |
| `tailwind.config.js`, `postcss.config.js`, custom `index.css` | Tailwind v4 + `styles/tokens.css` + `global.css` |
| Old `DESIGN.md` / `PRODUCT.md` | Rewritten target docs |
| Offline cache / local playlist stores | Removed with old state layer; reintroduced later only as an intentional Rem extra |

### 5.2 Preserved

- `.git` history; rewrite on branch `rewrite`.
- `server/` — rebuilt into proxy + catalog endpoints.
- `android/`, `capacitor.config.ts` — kept; verify background playback and Media Session.
- Deployment plumbing (`vercel.json`, env files, Capacitor scripts) — adapted.
- Non-code project assets — kept unless branding changes.

---

## 6. Workstreams

Each workstream ends in a runnable app. Relative effort: S ≈ days, M ≈ 1–2 weeks, L ≈ 2–4 weeks, XL ≈ 4+ weeks.

### WS0 — Foundations & reference capture (M)

**Deliverables**
- TS strict; Tailwind v4 via `@tailwindcss/vite`; path aliases.
- React Router 7/8 data router with every route lazy-loaded + page skeletons.
- TanStack Query client; TanStack Virtual for long lists.
- Vitest + happy-dom; fixtures folder.
- Reference capture: screenshots of BitChord's UI at 1440×900, 1024×768, 390×844 in light/dark; InnerTube fixtures (browse, search, album, artist, player); addon manifest/search/stream fixtures; lyric provider responses.

**Gate:** all routes navigate with lazy chunks; tokens compile; fixture tests run.

### WS1 — Design system & shell (L)

**Deliverables**
- `tokens.css`: our re-derived Apple Music token set (type, colors, radii, spacing, motion, z-index, light/dark, contrast, tint, full-screen).
- DM Sans; type scale; focus rings; skeleton shimmer.
- `AppShell`, `Sidebar` (nav + search field + library list), glass `PlayerBar` pill, `FullScreenPlayer`, `SidePanel`, `UpNext`, `MeshBackdrop`, `MobileTopBar`, mini player, `VolumeControl`, `NerdStats`, `AccountButton`, `Banner`.
- Scrubber hook; wheel volume; keyboard shortcuts; Media Session wiring.
- Mobile layout with safe-area insets.

**Gate:** screenshot comparison against BitChord at all breakpoints/themes; no layout shift on load.

### WS2 — Catalog transport & pages (XL)

**Deliverables**
- Express InnerTube endpoints (home, search, suggestions, album, artist, playlist, radio, related) with caching and fixtures.
- `data/music`: types, queries, mappers, shelf parsing.
- `data/match`: track matcher (conceptually ported from `TrackMatcher.kt`/`SourceTrackKeys.kt`).
- Components: `Artwork`, `MotionArtwork`, `Lockups`, `ShelfView`, `DetailHeader`, `TrackList`, `CategoryTiles`, `SearchField`, `ExplicitBadge`, `FavoriteButton`, `TrackMenu`, `States`.
- Pages: Home, Search, Album, Artist, Playlist, Library shell.
- Prefetch on link hover; virtualized long lists; skeleton parity.

**Gate:** every page renders real data; skeletons match final layout; empty/error states work.

### WS3 — Player core & queue (L)

**Deliverables**
- Zustand player state machine; queue builder/timeline (shuffle, repeat, radio/autoplay, Up Next edits).
- Gapless + true crossfade 0–12s via Web Audio graph; speed 0.5–2×; skip silence; sleep timer.
- Media Session metadata/handlers; history reporting; track log.
- `UpNext` panel interactions; now-playing links.

**Gate:** 20-track playback matrix passes; seeks, queue edits and track changes stay in sync; crossfade is click-free.

### WS4 — ProxyEngine (L)

**Deliverables**
- Harden Express + yt-dlp streaming: quality tiers, format selection, retries, caching, byte-range support.
- Client: preloading next track, failover, latency budget, gapless handoff.
- Android/Capacitor verification: background playback, notification, Media Session, screen-off behavior.
- Deployment validation (Vercel/serverless limits; fallback host if needed).

**Gate:** web-without-extension and Android APK play reliably; gapless behavior verified across tracks.

### WS5 — Lyrics (XL)

**Deliverables**
- Provider chain (priority, reorderable, disable-able): lrc.red, BiniLyrics, BetterLyrics, BetterLyrics Portato, PaxSenix (Apple/Spotify/Musixmatch), LyricsPlus mirrors, Unison, YouTube captions, YouTube Music lyrics, KuGou, LRCLIB, Musixmatch, Genius.
- CORS probing; per-provider extension permission requests for non-CORS hosts.
- Parsers: TTML, enhanced LRC, syllable runs, background vocals, sections, gaps, alignments.
- Convert every result to TTML; am-lyrics renderer (`@uimaxbai/am-lyrics/react`), hidden source footer, our provider picker.
- Steered playback clock: sample `performance.now()`, interpolate via rAF, announce seeks.
- Translation/romanization; lyrics panel + full-screen view; line-click seeking.

**Gate:** provider failover works; clock stays correct through seeks, pause, rate changes; translation matches the app behavior.

### WS6 — Extension & SabrEngine (XL)

**Deliverables**
- WXT MV3 package, Chrome + Firefox targets.
- Bridge contract: `ping`, `yt.fetch`, `yt.authState`, `addon.fetch`, `lyrics.fetch`, `spotify.*`, `discord.*`, streaming port for pushes; versioned types.
- `declarativeNetRequest`: rewrite `Origin`/`Referer` on `youtubei`/`googlevideo`; add CORS response headers; scope by `initiatorDomains`.
- Background worker: cookies, SAPISIDHASH, X-Goog-AuthUser, X-Origin, visitor data; account switching.
- SabrEngine: PO tokens, SABR via googlevideo, Shaka adapter/UMP, codec preference, client fallback chain.
- Extension detection, install/update banners, packaging zips and `extension.json`.
- Debug page + nerd stats.

**Gate:** 20 varied tracks (old/new/regional/explicit/age-restricted) play signed out from localhost with no audio through any server; extension detected in Chrome and Firefox.

### WS7 — Accounts & library (L)

**Deliverables**
- YouTube sign-in via extension (cookies + SAPISIDHASH); signed-out browsing intact.
- Library: playlists, albums, artists, liked songs, history; create/edit/delete; like/unlike; add to playlist.
- Account/channel switching.
- Capacitor path: proxy-based session or local-only library (validate during this workstream).

**Gate:** library mirrors the signed-in account; survives reloads; signed-out features unaffected.

### WS8 — Addons (L)

**Deliverables**
- Protocol: `GET {base}/manifest.json`, `search?q=`, `stream/{id}`; settings, defaults, quality tier matching, TTL caches.
- Matching: concept port of `TrackMatcher.kt`/`SourceTrackKeys.kt`.
- Playback: progressive `<audio>`; DASH/FLAC via Shaka; skip encrypted/unsupported codecs; `crossOrigin="anonymous"`.
- CORS-first with per-origin extension permission; remember per-addon route.
- Addon settings UI: add by URL, reorder, enable/disable, manifest details, permission status.

**Gate:** three real addons work, including a lossless DASH source.

### WS9 — Integrations (M–L)

**Deliverables**
- Spotify: `sp_dc` capture via extension; client token minting; Pathfinder library/playlist import; matching; Canvas behind artwork (lazy, reduced-motion and metered-aware).
- Discord: explicit connect action reads local token via content script; gateway WebSocket keep-alive; rich presence; build flag `DISCORD_PRESENCE`; one-line warning.
- Integration settings pages.

**Gate:** Spotify imports match sensibly; Canvas works; Discord presence updates live when enabled.

### WS10 — Listen Together (L)

**Deliverables**
- Server contract: REST party endpoints + WS frames (welcome, state, sync, members, queue, control, ping/pong, activity, kick, bye, error, report).
- Client: anchor-offset clock, smallest-RTT sample, playhead math, play lead, `AudioContext.outputLatency` compensation.
- Party UI, invite route, "Tap to join" autoplay gate.
- Backend choice: reuse the Go server contract or implement the protocol in Node on the existing Express server.
- CORS/allowed-origins configuration.

**Gate:** web + Android members stay within ~50 ms across play/pause/seek/next/queue edit.

### WS11 — Replay (M)

**Deliverables**
- IndexedDB bucket model (tracks, artists, albums, hourly/daily counters, day stats).
- Recording rules copied behaviorally from `ListeningRecorder.kt`.
- Phone backup import; summary; stories; shareable canvas poster.

**Gate:** stats survive reloads; backup imports; poster exports correctly.

### WS12 — Automix (XL, last)

**Deliverables**
- Analysis worker: beatgrid, BPM, key/Camelot, energy (essentia.js/ONNX).
- Deck engine: dual decks, EQ, loops, tempo stretch (signalsmith-stretch), transition scheduler.
- UI toggle + settings; debug diagnostics.

**Gate:** beat-matched transitions on tested tracks; no regressions when disabled.

### WS13 — Hardening & release (M)

**Deliverables**
- A11y: focus management, ARIA, 44px targets, screen-reader labels, keyboard coverage.
- `prefers-reduced-motion`, `prefers-contrast`, light/dark polish.
- Failure states: extension missing, proxy offline, permission denied, provider failures, empty states.
- Error boundaries; performance pass (bundle split, prefetch, image sizing).
- Deployment: web build, proxy hosting, extension packaging, Android APK.
- Docs: architecture, fixtures workflow, build/release instructions.

**Gate:** installable APK, deployed web build, extension zips; full parity checklist passes.

---

## 7. Feature parity checklist

| Feature | Target | Workstream |
|---|---|---|
| Apple Music shell + tokens | Exact | WS1 |
| Home/Browse shelves | Yes | WS2 |
| Search + suggestions | Yes | WS2 |
| Album / Artist / Playlist pages | Yes | WS2 |
| Direct SABR streaming | Web + extension | WS6 |
| Proxy streaming | Android + fallback | WS4 |
| Gapless + crossfade | Yes | WS3 |
| Queue / shuffle / repeat / radio | Yes | WS3 |
| Up Next panel | Yes | WS1/WS3 |
| Media Session + background | Yes | WS3/WS4 |
| Synced lyrics + translations | Yes | WS5 |
| YouTube sign-in + library | Yes | WS7 |
| Addon sources + lossless DASH | Yes | WS8 |
| Spotify import + Canvas | Yes | WS9 |
| Discord rich presence | Yes (flagged) | WS9 |
| Listen Together sync | Yes | WS10 |
| Replay stats/stories/poster | Yes | WS11 |
| Automix transitions | Yes | WS12 |
| Companion extension | Chrome + Firefox | WS6 |
| Mobile web banner → Android app | Yes | WS13 |
| PWA / downloads / casting | Out of scope | — |

---

## 8. Testing strategy

- **Fixtures first:** capture real InnerTube, addon, Spotify and lyric responses into `fixtures/` before writing parsers. Parsers test against fixtures, not live APIs.
- **Unit tests:** mappers, shelf parsing, track matcher, queue timeline, lyric clock, party clock, addon settings/tier matching, TTML conversion.
- **Visual checks:** screenshot comparison at 1440×900, 1024×768, 390×844, light/dark, against captured BitChord references.
- **Playback matrix:** 20 tracks spanning old/new/regional/explicit/age-restricted; test both engines, seeks, queue edits, crossfade, background, screen lock.
- **Sync test:** web + Android party session across all control frames.
- **CI:** typecheck, tests, build, extension build.

---

## 9. Deployment & platforms

| Target | Path |
|---|---|
| Web app | Static Vite build; deployed alongside proxy |
| Proxy/catalog server | Express; validate streaming on the chosen host (Vercel serverless limits may force an always-on host) |
| Extension | Package Chrome/Firefox zips; store build omits Discord and dev key; load-unpacked documented |
| Android | Capacitor wrapper; proxy playback; verify background/notification/Media Session |
| Mobile browsers | Banner pointing to the Android app (BitChord behavior) |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| YouTube breaks SABR/PO tokens | Client fallback chain, debug page, track log, proxy fallback always available |
| Extension store rejection | Firefox build, load-unpacked path, proxy fallback, Discord behind flag |
| Serverless can't stream yt-dlp | Validate in WS4; use a small always-on host if needed |
| Capacitor background/notification limits | Verify early; keep your existing Media Session work; native plugin if required |
| GPL contamination | Clean-room rules; no verbatim copies; dependency licenses audited |
| Scope (5–7 months) | Strict workstream order; each ends runnable; Automix last |
| Visual drift | Screenshot gates at each UI workstream |
| Lyric provider breakage | Provider chain + fixtures + user-reorderable settings |

---

## 11. Execution protocol

1. `git checkout -b rewrite`; tag/keep `main` as the pre-rewrite reference.
2. Delete the old `src/` app layer and rebuild from the layout in §4; keep server/android/config.
3. Replace build config: Tailwind v4, aliases, Vitest.
4. Execute WS0 → WS13 in order. Each workstream is one or more commits ending in a runnable state.
5. Run the gate checks before moving on.
6. Keep `docs/` and fixtures current as part of each workstream.

---

## 12. Definition of done (full parity)

- Rem looks and feels like BitChord's web player at desktop, tablet and mobile widths, in light/dark, with matching skeletons and motion.
- Desktop web plays YouTube audio directly via the extension (no server audio path); Android and extension-less web play via the proxy.
- All catalog pages work with real data and no layout shift.
- Queue, gapless, crossfade, radio/autoplay and Media Session behave like the target.
- Synced lyrics render with am-lyrics and stay in sync through seeks and rate changes.
- YouTube accounts/library, addons, Spotify, Discord, Listen Together, Replay and Automix are functional.
- Extension ships for Chrome and Firefox; documentation covers install, update and troubleshooting.
- Typecheck, tests and builds pass in CI; Android APK and web deployment are produced.

---

## 13. Effort summary

| Block | Workstreams | Estimate (solo, full-time) |
|---|---|---|
| Credible core | WS0–WS5 | 2–3 months |
| Web parity | WS6–WS9 | 2–3 months |
| Social/extras | WS10–WS12 | 1–2 months |
| Hardening/release | WS13 | 2–4 weeks |
| **Total** | **WS0–WS13** | **~5–7 months** |

BitChord itself represents 1,239 commits and many contributors; this plan is a realistic reimplementation scope, not a shortcut.
