# Rem Companion (MV3 extension)

A tiny, dependency-free companion extension for the Rem web player. It is the
W6 foundation: header rewriting, a page bridge, and a credentialed fetch helper
for YouTube InnerTube/Google Video hosts.

> **Status:** browser-direct playback is implemented. The page asks YouTube for
> a VISIONOS player response and plays the audio-only `googlevideo` URL from
> your own IP, with no server proxy. SABR/UMP, BotGuard PO tokens and
> signed-in InnerTube calls are still to come. See [Limitations](#limitations).

## What it does

1. **Header rewriting (declarativeNetRequest)**
   - Scoped to Rem's origins (`initiatorDomains`), so YouTube's own tabs and
     every other site are untouched.
   - Sets `Origin`/`Referer`/`X-Origin` on `www.youtube.com/youtubei/` and
     `music.youtube.com/youtubei/` calls, and on `googlevideo.com` media.
   - Removes `Origin`/`Referer` from `c=VISIONOS` direct URLs: those are refused
     with 403 mid-track when they carry a web origin.
   - Adds `Access-Control-Allow-Origin: *` and `Access-Control-Expose-Headers`
     on responses from YouTube/Google Video hosts, so the page can read them.
   - Deliberately does **not** rewrite `www.youtube.com/api/jnn` (BotGuard):
     that endpoint refuses a rewritten Origin.
2. **Page bridge (content script)**
   - Injected on Rem origins at `document_start`.
   - Marks `<html data-rem-extension="1">`, fires `rem:extension-ready`, and
     relays `window.postMessage` requests to the background worker.
3. **Background helper**
   - `ping` — extension/bridge versions and capabilities.
   - `authState` — whether YouTube session cookies exist (no signing yet).
   - `ytFetch` — allow-listed, credentialed fetch to YouTube/Google Video
     hosts. Returns `{ status, ok, headers, text }`.
   - `addonFetch`, `lyricsFetch`, `spotify`, `discord` are reserved by the
     shared contract and currently return an `unsupported` error.

The extension never proxies audio bytes. Audio is streamed directly by the
browser from Google Video; the Rem server is not involved in playback when the
extension is present.

## Install — Chrome / Edge (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` folder.
4. Reload the Rem tab. The extension injects its content script only on page
   load, so a reload is required after installing or updating.
5. Open Rem → **Settings → Companion extension** and press **Recheck**.

## Install — Firefox (temporary add-on)

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…**.
3. Select `extension/manifest.json` (not the folder).
4. Reload the Rem tab.

Firefox removes temporary add-ons when the browser restarts. The manifest
includes `browser_specific_settings.gecko` and uses the same MV3 APIs, but
Firefox's MV3 background implementation has historically used event pages
rather than service workers. If the extension appears in `about:debugging` but
requests fail, check the extension's console for background errors and use a
recent Firefox release. Chrome/Edge is the primary target for this foundation.

> Match patterns cannot include ports. `http://localhost/*` and
> `http://127.0.0.1/*` therefore match every local dev port, including Vite's
> `5173` and preview's `4173`.

## Bridge contract (version 1)

Page → content script:

```js
window.postMessage(
  { source: 'rem-page', id: 'abc123', type: 'ping', payload: {} },
  window.location.origin
);
```

Content script → page:

```js
{ source: 'rem-extension', id: 'abc123', ok: true, data: { ... } }
{ source: 'rem-extension', id: 'abc123', ok: false, error: { code: 'unsupported', message: '…' } }
```

The TypeScript definitions live in `src/bridge/contract.ts`. The plain JS here
mirrors `BRIDGE_CONTRACT_VERSION = 1`; bump both together when the contract
changes.

## Permissions

| Permission | Why |
|---|---|
| `declarativeNetRequest`, `declarativeNetRequestWithHostAccess` | Rewrite `Origin`/`Referer` and add CORS response headers. |
| `cookies` | Detect whether a YouTube session exists. No cookie values leave the browser. |
| `storage` | Reserved for cached visitor data / bridge settings. |
| `scripting`, `activeTab` | Reserved for future integration capture flows. |
| Host permissions | Only YouTube, Google Video, Google user content and local Rem origins. |

## Limitations

- **No SABR/UMP, BotGuard or PO tokens yet.** Playback uses VISIONOS, which
  returns plain deciphered audio URLs and needs no token. The web clients
  (`YTMUSIC`, `WEB`, `MWEB`) only offer SABR and require a PO token, so they are
  not attempted yet.
- **No audio byte proxying.** If a direct URL cannot be resolved (age gate,
  region block, 403, extension missing), Rem falls back to the server stream
  proxy.
- **CORS is permissive by design.** The extension sets
  `Access-Control-Allow-Origin: *` on YouTube/Google Video responses. This is
  scoped to those hosts, but it means any page can read those responses if the
  extension is installed (the content script itself is only injected into
  Rem).
- **Firefox support is best-effort.** Load-unpacked Chrome/Edge is the tested
  path for this foundation.
- Install/update of an unpacked extension requires reloading the Rem tab
  before detection succeeds.
