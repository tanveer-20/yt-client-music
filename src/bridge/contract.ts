/**
 * Rem page <-> companion-extension contract.
 *
 * Wire shape:
 *
 *   page  --postMessage-->  content.js  --runtime.sendMessage-->  background.js
 *   page  <--postMessage--  content.js  <--sendResponse---------  background.js
 *
 * Every request has a page-generated string `id`; the response echoes it so
 * concurrent requests can be correlated. Bump `BRIDGE_CONTRACT_VERSION` and
 * `extension/background.js`/`content.js` together when the wire format or the
 * meaning of any message changes.
 *
 * This module has no runtime dependencies and is safe to import from React,
 * the playback layer or plain modules.
 */

export const BRIDGE_CONTRACT_VERSION = 1 as const;

/** Source marker used by the web page when posting a message. */
export const PAGE_MESSAGE_SOURCE = 'rem-page' as const;

/** Source marker used by the content script when posting a reply. */
export const EXTENSION_MESSAGE_SOURCE = 'rem-extension' as const;

/** DOM event dispatched by the content script when it is ready. */
export const EXTENSION_READY_EVENT = 'rem:extension-ready' as const;

/** Channel marker for content script -> background messages. */
export const EXTENSION_BRIDGE_CHANNEL = 'rem-bridge' as const;

/** Attribute set on `<html>` by the content script. */
export const EXTENSION_DATASET_KEY = 'remExtension' as const;

// ─── Message catalogue ───────────────────────────────────────

export type BridgeRequestType =
  | 'ping'
  | 'authState'
  | 'ytFetch'
  | 'addonFetch'
  | 'lyricsFetch'
  | 'spotify'
  | 'discord';

export type BridgeErrorCode =
  | 'unsupported'
  | 'invalid-request'
  | 'invalid-host'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'timeout'
  | 'no-extension'
  | 'internal'
  | 'unknown';

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  details?: string;
}

/** Common error shape for thrown bridge errors on the page side. */
export class BridgeRequestError extends Error {
  readonly code: BridgeErrorCode;
  readonly requestType?: BridgeRequestType;
  readonly details?: string;

  constructor(
    code: BridgeErrorCode,
    message: string,
    requestType?: BridgeRequestType,
    details?: string
  ) {
    super(message);
    this.name = 'BridgeRequestError';
    this.code = code;
    this.requestType = requestType;
    this.details = details;
  }
}

// ─── ping ────────────────────────────────────────────────────

export interface PingRequestPayload {
  /** Optional caller label for diagnostics. */
  client?: string;
}

export interface PingResult {
  /** Extension manifest version, e.g. `0.1.0`. */
  version: string;
  /** Wire-contract version the extension implements. */
  bridgeVersion: number;
  /** Messages implemented by this build. */
  capabilities: BridgeRequestType[];
  /** Messages reserved by the contract but not implemented yet. */
  reserved?: BridgeRequestType[];
  /** The Chrome/Firefox extension id, when available. */
  extensionId?: string;
}

// ─── authState ───────────────────────────────────────────────

export interface AuthStatePayload {
  /** Reserved: ask the extension to run an interactive sign-in flow. */
  interactive?: boolean;
}

export interface AuthStateResult {
  signedIn: boolean;
  hasCookies: boolean;
  cookieNames?: string[];
  channelId?: string;
  channelName?: string;
  avatarUrl?: string;
  /** True once SAPISIDHASH signing + authenticated InnerTube are implemented. */
  sapisidHashSupported: boolean;
  note?: string;
}

// ─── HTTP fetch (ytFetch / addonFetch / lyricsFetch) ─────────

export interface HttpRequestPayload {
  url: string;
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  /** Request body for POST, already serialized to a string. */
  body?: string;
}

export interface HttpFetchResult {
  status: number;
  ok: boolean;
  /** Final URL after redirects. */
  url: string;
  redirected?: boolean;
  headers: Record<string, string>;
  text: string;
}

// ─── Integrations (reserved) ─────────────────────────────────

export type SpotifyAction = 'status' | 'captureSession' | 'clearSession';

export interface SpotifyPayload {
  action: SpotifyAction;
}

export interface SpotifyResult {
  connected: boolean;
  hasCredentials: boolean;
  expiresAt?: number;
  note?: string;
}

export type DiscordAction = 'status' | 'connect' | 'disconnect' | 'setActivity';

export interface DiscordActivity {
  details?: string;
  state?: string;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

export interface DiscordPayload {
  action: DiscordAction;
  activity?: DiscordActivity;
}

export interface DiscordResult {
  connected: boolean;
  userId?: string;
  username?: string;
  note?: string;
}

// ─── Typed request/response map ─────────────────────────────

export interface BridgeRequestMap {
  ping: { payload: PingRequestPayload; result: PingResult };
  authState: { payload: AuthStatePayload; result: AuthStateResult };
  ytFetch: { payload: HttpRequestPayload; result: HttpFetchResult };
  addonFetch: { payload: HttpRequestPayload; result: HttpFetchResult };
  lyricsFetch: { payload: HttpRequestPayload; result: HttpFetchResult };
  spotify: { payload: SpotifyPayload; result: SpotifyResult };
  discord: { payload: DiscordPayload; result: DiscordResult };
}

export type BridgeRequestPayload<K extends BridgeRequestType> = BridgeRequestMap[K]['payload'];
export type BridgeRequestResult<K extends BridgeRequestType> = BridgeRequestMap[K]['result'];

// ─── Envelopes ──────────────────────────────────────────────

export interface BridgeRequest<K extends BridgeRequestType = BridgeRequestType> {
  source: typeof PAGE_MESSAGE_SOURCE;
  id: string;
  type: K;
  payload?: BridgeRequestMap[K]['payload'];
}

export interface BridgeSuccess<T = unknown> {
  source: typeof EXTENSION_MESSAGE_SOURCE;
  id: string;
  ok: true;
  data: T;
  error?: never;
}

export interface BridgeFailure {
  source: typeof EXTENSION_MESSAGE_SOURCE;
  id: string;
  ok: false;
  data?: never;
  error: BridgeError;
}

export type BridgeResponse<T = unknown> = BridgeSuccess<T> | BridgeFailure;

/** Message sent by content.js to background.js. */
export interface BackgroundRequest<K extends BridgeRequestType = BridgeRequestType> {
  channel: typeof EXTENSION_BRIDGE_CHANNEL;
  type: K;
  payload?: BridgeRequestMap[K]['payload'];
}

export type BackgroundResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: BridgeError };

// ─── Detection helpers shared by the page ───────────────────

export function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BridgeRequest>;
  return (
    candidate.source === PAGE_MESSAGE_SOURCE &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.type === 'string'
  );
}

export function isBridgeResponse(value: unknown): value is BridgeResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BridgeResponse>;
  return (
    candidate.source === EXTENSION_MESSAGE_SOURCE &&
    typeof candidate.id === 'string' &&
    typeof candidate.ok === 'boolean'
  );
}
