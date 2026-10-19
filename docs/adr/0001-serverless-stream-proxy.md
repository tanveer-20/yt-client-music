# Serverless stream proxy on Vercel (`api/stream`) so top-level HTML5 audio owns MediaSession

**Status**: accepted (2026-10-19) — supersedes the "no serverless stream proxy" position in
`docs/research/client-only-architecture-analysis.md` (§2.3, "Why Vercel Serverless Functions
Cannot Proxy Full Audio Streams").

**Deployment update (2026-10-19, live-measured)**: the proxy shipped and is correct end-to-end
(20/20 local range/CORS/HEAD checks), but YouTube's attestation wall rejects `/player`
resolution from Vercel's datacenter egress for essentially every track: VISIONOS, ANDROID_VR,
IOS and WEB_REMIX (music host) all return `LOGIN_REQUIRED`; ANDROID_TESTSUITE `UNPLAYABLE`;
TVHTML5 "no longer supported"; the `youtubei.googleapis.com` host and `WEB_EMBEDDED_PLAYER`
tickets don't break the wall either. Session rotation + cookies/visitorData flow is
implemented and works from residential IPs, but does not change the datacenter verdict.
Deployed behavior therefore degrades exactly one step behind: first HEAD probe fast-fails
(~7s once, then 12h per-backend dead-cache), and playback falls back to the YouTube iframe
engine — i.e. never worse than the pre-proxy baseline. Full background playback on mobile
Chrome requires a resolver on a trusted IP: on-device (APK path — implemented) or a
residential/hosted resolver per ADR-0002.

## Context

On the deployed web app, playback fell back to a hidden cross-origin YouTube iframe whenever
no stream URL could be resolved. Chrome's Media Session rule: **notifications are owned by the
frame that owns the media resource** — top-level `navigator.mediaSession` metadata cannot
override the iframe's session, and mobile browsers suspend iframe execution on screen lock, so
background playback died. Public Piped instances are dead, and the local LAN server breaks
whenever the phone leaves home Wi-Fi.

## Decision

Ship `api/stream` as a Vercel serverless function: it mirrors a real browser session (watch
page + cookies + visitor data) before each InnerTube `/player` call with ANDROID_VR /
ANDROID_TESTSUITE / IOS / TVHTML5 mobile clients, then proxies `googlevideo` bytes with Range
support, a 1MB per-invocation cap, and `Access-Control-Allow-Origin: *`. The client probes it
(`HEAD /api/stream/:id`, 8s timeout) first on web and only commits to the HTML5 `<audio>`
engine — which owns MediaSession, notifications, and lock-screen controls — when the probe
succeeds; otherwise it falls back to Piped, then the iframe. A 12h per-backend dead-cache so
a bot-wall rejection doesn't delay every track change.

This reverses the earlier belief that Vercel's datacenter egress is always rejected for
`/player` + media bytes: `api/search.js` / `api/suggestions.js` InnerTube calls already work
from Vercel IPs, and with the watch-page session flow the full resolution+stream path also
succeeded (validated locally, 20/20 checks; Vercel egress to be confirmed on deploy).

## Rejected alternatives

- **Oracle Always Free VPS running the existing `server/` (yt-dlp)** — best fallback, but needs
  account setup the user doesn't have and new ops surface (server maintenance). Kept as Plan B.
- **Render / Cloudflare Workers** — similar datacenter-IP risk plus new-account friction.
- **Relying on browser goodwill (Brave "Background Audio")** — works today via content filters,
  but it's a cat-and-mouse platform workaround, not an app fix; it breaks on filter-list/YouTube
  updates and produces YouTube-branded notifications instead of the app's.

## Consequences

- Media-session notifications become the app's own (cleaned of "- Topic"), shown from first play.
- Vercel Hobby limits apply: `maxDuration: 60` on the proxy (Fluid 300s available if needed),
  bandwidth counts against the 100GB transfer tier.
- Every chunked request re-hits `googlevideo` (~4 requests/track at 1MB each); `youtube.com`
  `/player` calls are cached per `videoId` with googlevideo `expire`-based TTL (~50 entries,
  warm instances only).
- If YouTube tightens PO-token enforcement on datacenter IPs, first play degrades to the
  iframe path again after one failed probe (3.5s, then instant for 12h) — Plan B then applies.
