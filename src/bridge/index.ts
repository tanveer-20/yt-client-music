/**
 * Page-side client for the Rem Companion extension bridge.
 *
 * No React dependency: this module can be used from the playback resolver,
 * data layer or tests. The content script is the only thing that talks to
 * chrome.runtime; this module only talks to the content script with
 * window.postMessage.
 */

import {
  BRIDGE_CONTRACT_VERSION,
  BridgeRequestError,
  EXTENSION_DATASET_KEY,
  EXTENSION_READY_EVENT,
  PAGE_MESSAGE_SOURCE,
  isBridgeResponse,
  type BridgeRequest,
  type BridgeRequestPayload,
  type BridgeRequestResult,
  type BridgeRequestType,
  type PingResult,
} from './contract';

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const PING_TIMEOUT_MS = 1_500;
const FAST_PING_TIMEOUT_MS = 700;
const PROBE_CACHE_MS = 3_000;

export interface ExtensionProbe {
  present: boolean;
  /** Extension manifest version, when the ping succeeded. */
  version: string | null;
  /** Wire-contract version reported by the extension. */
  bridgeVersion: number | null;
  /** False when the extension is present but speaks a different contract. */
  compatible: boolean;
  /** Epoch milliseconds of this probe. */
  checkedAt: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: BridgeRequestError) => void;
  timeout: number;
  type: BridgeRequestType;
}

const pendingRequests = new Map<string, PendingRequest>();
let responseListenerAttached = false;
let requestCounter = 0;
let cachedProbe: ExtensionProbe | null = null;

// ─── Internals ───────────────────────────────────────────────

function targetOrigin(): string {
  const origin = window.location.origin;
  return origin && origin !== 'null' ? origin : '*';
}

function createRequestId(): string {
  requestCounter += 1;
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  return `rem-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

function detachResponseListenerIfIdle(): void {
  if (pendingRequests.size > 0 || !responseListenerAttached) return;
  window.removeEventListener('message', handleWindowMessage);
  responseListenerAttached = false;
}

function ensureResponseListener(): void {
  if (responseListenerAttached) return;
  window.addEventListener('message', handleWindowMessage);
  responseListenerAttached = true;
}

function handleWindowMessage(event: MessageEvent): void {
  if (event.source !== window) return;
  if (!isBridgeResponse(event.data)) return;

  const data = event.data;
  const pending = pendingRequests.get(data.id);
  if (!pending) return;

  pendingRequests.delete(data.id);
  window.clearTimeout(pending.timeout);
  detachResponseListenerIfIdle();

  if (data.ok) {
    pending.resolve(data.data);
    return;
  }

  const error = data.error;
  pending.reject(
    new BridgeRequestError(
      error?.code ?? 'unknown',
      error?.message ?? 'The extension request failed.',
      pending.type,
      error?.details
    )
  );
}

// ─── Public API ──────────────────────────────────────────────

/**
 * True when the content script has marked the document. This is a cheap,
 * synchronous hint; use `probeExtension()`/`isExtensionAvailable()` when the
 * answer must be authoritative.
 */
export function isExtensionMarked(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement?.dataset?.[EXTENSION_DATASET_KEY] === '1';
}

/**
 * Send a typed message to the extension and await its correlated reply.
 * The pending entry, timeout and global listener are always cleaned up.
 */
export function extensionRequest<K extends BridgeRequestType>(
  type: K,
  payload?: BridgeRequestPayload<K>,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<BridgeRequestResult<K>> {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new BridgeRequestError(
        'no-extension',
        'The extension bridge is only available in a browser window.',
        type
      )
    );
  }

  ensureResponseListener();

  return new Promise<BridgeRequestResult<K>>((resolve, reject) => {
    const id = createRequestId();
    const timeout = window.setTimeout(() => {
      pendingRequests.delete(id);
      detachResponseListenerIfIdle();
      reject(
        new BridgeRequestError(
          'timeout',
          `The extension did not answer "${type}" within ${timeoutMs}ms.`,
          type
        )
      );
    }, Math.max(100, timeoutMs));

    pendingRequests.set(id, {
      resolve: (value) => resolve(value as BridgeRequestResult<K>),
      reject,
      timeout,
      type,
    });

    const request: BridgeRequest<K> = {
      source: PAGE_MESSAGE_SOURCE,
      id,
      type,
      payload,
    };

    try {
      window.postMessage(request, targetOrigin());
    } catch (error) {
      pendingRequests.delete(id);
      window.clearTimeout(timeout);
      detachResponseListenerIfIdle();
      reject(
        new BridgeRequestError(
          'internal',
          error instanceof Error ? error.message : 'Could not post the bridge request.',
          type
        )
      );
    }
  });
}

/**
 * Probe the extension and cache the result briefly. `force` bypasses the
 * cache so a "Recheck" button always sees the current state.
 */
export async function probeExtension(force = false): Promise<ExtensionProbe> {
  if (!force && cachedProbe && Date.now() - cachedProbe.checkedAt < PROBE_CACHE_MS) {
    return cachedProbe;
  }

  const checkedAt = Date.now();

  if (typeof window === 'undefined') {
    cachedProbe = {
      present: false,
      version: null,
      bridgeVersion: null,
      compatible: false,
      checkedAt,
    };
    return cachedProbe;
  }

  const marked = isExtensionMarked();

  try {
    const result: PingResult = await extensionRequest(
      'ping',
      { client: 'rem-web' },
      marked ? PING_TIMEOUT_MS : FAST_PING_TIMEOUT_MS
    );

    if (!result || typeof result.version !== 'string') {
      throw new Error('Malformed ping response');
    }

    cachedProbe = {
      present: true,
      version: result.version,
      bridgeVersion: typeof result.bridgeVersion === 'number' ? result.bridgeVersion : null,
      compatible: result.bridgeVersion === BRIDGE_CONTRACT_VERSION,
      checkedAt,
    };
  } catch {
    // A stale content script (extension updated/removed) leaves the dataset
    // attribute behind. Clear it so a later probe does not report a false
    // positive.
    if (marked && typeof document !== 'undefined' && document.documentElement) {
      delete document.documentElement.dataset[EXTENSION_DATASET_KEY];
    }

    cachedProbe = {
      present: false,
      version: null,
      bridgeVersion: null,
      compatible: false,
      checkedAt,
    };
  }

  return cachedProbe;
}

/** Convenience wrapper for call sites that only need a boolean. */
export async function isExtensionAvailable(force = false): Promise<boolean> {
  return (await probeExtension(force)).present;
}

/** Extension manifest version, or null when the extension is not detected. */
export async function getExtensionVersion(force = false): Promise<string | null> {
  return (await probeExtension(force)).version;
}

/**
 * Subscribe to the content script's ready signal. If the extension was
 * already present before React mounted, the callback is queued once via a
 * microtask so callers still see it.
 *
 * Returns an unsubscribe function.
 */
export function onExtensionReady(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = () => {
    callback();
  };
  window.addEventListener(EXTENSION_READY_EVENT, handler);

  if (isExtensionMarked()) {
    queueMicrotask(() => {
      try {
        callback();
      } catch {
        /* a listener error must not break the bridge */
      }
    });
  }

  return () => window.removeEventListener(EXTENSION_READY_EVENT, handler);
}

export * from './contract';
