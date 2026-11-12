/**
 * Rem Companion — page <-> extension content script.
 *
 * Injected at document_start on Rem origins only. It provides a tiny,
 * dependency-free postMessage bridge:
 *
 *   page  -> window.postMessage({ source: 'rem-page', id, type, payload })
 *   page  <- window.postMessage({ source: 'rem-extension', id, ok, data|error })
 *
 * `ping` is answered immediately from this script (so detection is fast and
 * works even while the service worker is starting). All other messages are
 * forwarded to the background worker via chrome.runtime.sendMessage.
 *
 * The script also marks the document with data-rem-extension="1" and fires a
 * `rem:extension-ready` DOM event so the app can detect the extension before
 * React mounts.
 *
 * Keep this file plain JavaScript: the extension has no build step.
 */

(() => {
  const PAGE_SOURCE = 'rem-page';
  const EXTENSION_SOURCE = 'rem-extension';
  const BRIDGE_CHANNEL = 'rem-bridge';
  const BRIDGE_CONTRACT_VERSION = 1;
  const READY_EVENT = 'rem:extension-ready';

  const api = globalThis.browser ?? globalThis.chrome;

  if (!api || !api.runtime || !api.runtime.id) {
    // Not running as an extension (or the context was invalidated). Do not
    // touch the page at all.
    return;
  }

  /** Message types the bridge contract knows about. */
  const KNOWN_TYPES = new Set([
    'ping',
    'authState',
    'ytFetch',
    'addonFetch',
    'lyricsFetch',
    'spotify',
    'discord',
  ]);

  /**
   * Implemented today. Everything else is reserved by the contract and the
   * background worker returns an `unsupported` error for it.
   */
  const CAPABILITIES = ['ping', 'authState', 'ytFetch'];
  const RESERVED = ['addonFetch', 'lyricsFetch', 'spotify', 'discord'];

  function targetOrigin() {
    const origin = window.location.origin;
    return origin && origin !== 'null' ? origin : '*';
  }

  function postToPage(message) {
    try {
      window.postMessage(message, targetOrigin());
    } catch {
      // Extremely old browsers / detached frames: best-effort fallback.
      try {
        window.postMessage(message, '*');
      } catch {
        /* ignore */
      }
    }
  }

  function pingPayload() {
    let version = '0.1.0';
    try {
      version = api.runtime.getManifest().version || version;
    } catch {
      /* manifest unavailable */
    }
    return {
      version,
      bridgeVersion: BRIDGE_CONTRACT_VERSION,
      capabilities: CAPABILITIES.slice(),
      reserved: RESERVED.slice(),
      extensionId: api.runtime.id,
    };
  }

  function respond(id, ok, data, error) {
    const message = { source: EXTENSION_SOURCE, id, ok: !!ok };
    if (ok) {
      message.data = data;
    } else {
      message.error = error || { code: 'unknown', message: 'The extension request failed.' };
    }
    postToPage(message);
  }

  function normalizeError(error) {
    if (error && typeof error === 'object' && typeof error.message === 'string') {
      return {
        code: typeof error.code === 'string' ? error.code : 'unknown',
        message: error.message,
        ...(typeof error.details === 'string' ? { details: error.details } : {}),
      };
    }
    return { code: 'unknown', message: 'The extension request failed.' };
  }

  /**
   * Send to the background worker using callbacks (Chrome) or promises
   * (Firefox), whichever the current namespace exposes. Resolves exactly once.
   */
  function sendToBackground(message, callback) {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    try {
      const maybePromise = api.runtime.sendMessage(message, (response) => {
        const lastError = api.runtime.lastError;
        if (lastError) {
          finish({
            ok: false,
            error: { code: 'internal', message: lastError.message || 'Message failed.' },
          });
        } else {
          finish(response);
        }
      });

      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(
          (response) => finish(response),
          (error) => {
            finish({
              ok: false,
              error: {
                code: 'internal',
                message: error && error.message ? error.message : 'Message failed.',
              },
            });
          }
        );
      }
    } catch (error) {
      finish({
        ok: false,
        error: {
          code: 'internal',
          message: error && error.message ? error.message : 'Message failed.',
        },
      });
    }
  }

  function forward(request) {
    sendToBackground(
      {
        channel: BRIDGE_CHANNEL,
        type: request.type,
        payload: request.payload,
      },
      (response) => {
        if (!response || typeof response !== 'object') {
          respond(request.id, false, undefined, {
            code: 'internal',
            message:
              'The Rem Companion background worker did not respond. Reload the page or reinstall the extension.',
          });
          return;
        }
        if (response.ok) {
          respond(request.id, true, response.data);
        } else {
          respond(request.id, false, undefined, normalizeError(response.error));
        }
      }
    );
  }

  window.addEventListener(
    'message',
    (event) => {
      // Only accept messages this window posted to itself. Other frames,
      // opener windows and extension messages are ignored.
      if (event.source !== window) return;

      const data = event.data;
      if (!data || data.source !== PAGE_SOURCE) return;
      if (typeof data.id !== 'string' || data.id.length === 0 || data.id.length > 128) return;
      if (typeof data.type !== 'string' || !KNOWN_TYPES.has(data.type)) return;
      if (data.payload !== undefined && (typeof data.payload !== 'object' || data.payload === null)) {
        respond(data.id, false, undefined, {
          code: 'invalid-request',
          message: 'Bridge payload must be an object.',
        });
        return;
      }

      // Ping is answered locally: no service-worker round-trip needed.
      if (data.type === 'ping') {
        respond(data.id, true, pingPayload());
        return;
      }

      forward(data);
    },
    false
  );

  // ─── Ready signalling ──────────────────────────────────────

  function markReady() {
    const root = document.documentElement;
    if (!root) return false;
    root.dataset.remExtension = '1';
    root.dataset.remBridgeVersion = String(BRIDGE_CONTRACT_VERSION);
    return true;
  }

  function announceReady() {
    if (!markReady()) return;
    try {
      window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: pingPayload() }));
    } catch {
      // CustomEvent is universally available in supported browsers; ignore.
    }
  }

  // At document_start the <html> element is usually available, but guard
  // against the rare case where it is not.
  if (!markReady()) {
    document.addEventListener('readystatechange', announceReady, { once: true });
    document.addEventListener('DOMContentLoaded', announceReady, { once: true });
  }
  announceReady();
})();
