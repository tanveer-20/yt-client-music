/**
 * Discord rich presence over the gateway.
 *
 * Rem holds a single user-token gateway connection per server process. The
 * token is kept in memory only and is never logged or returned by the API.
 *
 * Note: user-token presence is an unofficial integration. Discord can reject
 * or invalidate it at any time (close code 4004), which this service surfaces
 * as a readable error without retrying.
 */

import WebSocket, { type RawData } from 'ws';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const FATAL_CLOSE_CODES = new Set<number>([4003, 4004, 4014]);
const HANDSHAKE_TIMEOUT_MS = 20_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export interface DiscordActivityInput {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  /** Milliseconds since the Unix epoch. Seconds are also accepted. */
  startedAt?: number;
  paused?: boolean;
}

export interface DiscordStatus {
  connected: boolean;
  connecting: boolean;
  username: string | null;
  userId: string | null;
  applicationId: string | null;
  activity: DiscordActivityInput | null;
  error: string | null;
  since: number | null;
  reconnectAttempt: number;
}

interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

let socket: WebSocket | null = null;
let token: string | null = null;
let applicationId: string | null = null;
let identity: { username: string; userId: string } | null = null;
let activity: DiscordActivityInput | null = null;

let ready = false;
let connecting = false;
let manualClose = false;
let fatal = false;
let lastError: string | null = null;
let connectedAt: number | null = null;
let reconnectAttempts = 0;

let heartbeatIntervalMs = 41_250;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sequence: number | null = null;
let awaitingAck = false;

let pendingResolve: ((status: DiscordStatus) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;

// ─── Helpers ─────────────────────────────────────────────────

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function normalizeStartedAt(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  // Accept both seconds and milliseconds.
  return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return Buffer.concat(data.map((part) => Buffer.from(part as unknown as Uint8Array)))
      .toString('utf8');
  }
  return Buffer.from(data as unknown as Uint8Array).toString('utf8');
}

export function getStatus(): DiscordStatus {
  return {
    connected: ready,
    connecting,
    username: identity?.username ?? null,
    userId: identity?.userId ?? null,
    applicationId,
    activity,
    error: lastError,
    since: connectedAt,
    reconnectAttempt: reconnectAttempts,
  };
}

// ─── Presence payloads ───────────────────────────────────────

function buildActivity(): Record<string, unknown> {
  if (!activity) {
    return {
      name: 'Rem',
      type: 2,
      details: 'Listening to Rem',
      state: 'Nothing playing yet',
    };
  }

  const assets: Record<string, string> = {};
  if (activity.artwork) {
    // Discord usually ignores external image URLs unless the application is
    // whitelisted, but setting it is harmless and works for verified apps.
    assets.large_image = truncate(activity.artwork, 256);
    assets.large_text = truncate(activity.album || activity.title || 'Rem', 128);
  }

  const startsAt = normalizeStartedAt(activity.startedAt);

  return {
    name: activity.paused ? 'Rem (paused)' : 'Rem',
    type: 2,
    details: truncate(activity.title || 'Rem', 128),
    state: truncate(activity.artist || 'Unknown artist', 128),
    ...(Object.keys(assets).length ? { assets } : {}),
    ...(startsAt && !activity.paused ? { timestamps: { start: startsAt } } : {}),
  };
}

function presencePayload(): Record<string, unknown> {
  return {
    since: 0,
    activities: [buildActivity()],
    status: 'online',
    afk: false,
  };
}

function send(op: number, data: unknown): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ op, d: data }));
  }
}

function sendPresence(): void {
  send(3, presencePayload());
}

// ─── Timers and pending connection ───────────────────────────

function clearHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  awaitingAck = false;
}

function clearHandshake(): void {
  if (handshakeTimer) {
    clearTimeout(handshakeTimer);
    handshakeTimer = null;
  }
}

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function rejectPending(error: Error): void {
  const reject = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  reject?.(error);
}

function resolvePending(status: DiscordStatus): void {
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingReject = null;
  resolve?.(status);
}

// ─── Gateway lifecycle ───────────────────────────────────────

function startHeartbeat(): void {
  clearHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (awaitingAck) {
      lastError = 'Discord stopped acknowledging heartbeats. Reconnecting…';
      socket?.terminate();
      return;
    }
    awaitingAck = true;
    send(1, sequence);
  }, heartbeatIntervalMs);
}

function identify(): void {
  if (!token) return;
  send(2, {
    token,
    properties: {
      os: process.platform,
      browser: 'Rem',
      device: 'Rem desktop',
    },
    compress: false,
  });
}

function handleReady(data: unknown): void {
  const readyData = data as {
    user?: { id?: unknown; username?: unknown };
    application?: { id?: unknown };
  };

  identity = {
    username:
      typeof readyData.user?.username === 'string' ? readyData.user.username : 'Discord user',
    userId: typeof readyData.user?.id === 'string' ? readyData.user.id : '',
  };

  if (!applicationId && typeof readyData.application?.id === 'string') {
    applicationId = readyData.application.id;
  }

  ready = true;
  connecting = false;
  manualClose = false;
  fatal = false;
  lastError = null;
  reconnectAttempts = 0;
  connectedAt = Date.now();
  clearHandshake();

  // Requirement: once READY, announce presence explicitly.
  sendPresence();
  resolvePending(getStatus());
}

function handleMessage(ws: WebSocket, data: RawData): void {
  if (ws !== socket) return;

  let payload: GatewayPayload;
  try {
    payload = JSON.parse(rawToString(data)) as GatewayPayload;
  } catch {
    return;
  }

  if (typeof payload.s === 'number') sequence = payload.s;

  switch (payload.op) {
    case 10: {
      const hello = payload.d as { heartbeat_interval?: unknown };
      if (
        typeof hello?.heartbeat_interval === 'number' &&
        Number.isFinite(hello.heartbeat_interval) &&
        hello.heartbeat_interval > 0
      ) {
        heartbeatIntervalMs = hello.heartbeat_interval;
      }
      startHeartbeat();
      identify();
      break;
    }
    case 11:
      awaitingAck = false;
      break;
    case 1:
      send(1, sequence);
      break;
    case 7:
      ws.close(1000, 'Reconnect requested');
      break;
    case 9:
      ws.close(1000, 'Invalid session');
      break;
    case 0:
      if (payload.t === 'READY') handleReady(payload.d);
      break;
    default:
      break;
  }
}

function scheduleReconnect(): void {
  if (!token || manualClose || fatal || reconnectTimer) return;

  const attempt = reconnectAttempts;
  reconnectAttempts += 1;
  const delay = Math.min(
    MAX_RECONNECT_DELAY_MS,
    1000 * 2 ** Math.min(attempt, 5)
  );

  connecting = true;
  lastError = `Discord connection lost. Reconnecting in ${Math.ceil(delay / 1000)}s…`;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!token || manualClose || fatal) return;
    openSocket();
  }, delay);
}

function openSocket(): void {
  if (!token) return;

  clearReconnect();
  clearHandshake();
  ready = false;
  connecting = true;
  fatal = false;
  manualClose = false;
  sequence = null;
  awaitingAck = false;

  let ws: WebSocket;
  try {
    ws = new WebSocket(GATEWAY_URL);
  } catch (error) {
    connecting = false;
    lastError = 'Could not open a connection to the Discord gateway.';
    rejectPending(new Error(lastError));
    return;
  }

  socket = ws;

  handshakeTimer = setTimeout(() => {
    if (ws !== socket || ready) return;
    lastError = 'Discord did not complete the gateway handshake in time.';
    connecting = false;

    // A first-time connect should fail visibly rather than retry forever.
    if (pendingReject) {
      manualClose = true;
      token = null;
      rejectPending(new Error(lastError));
    }

    ws.terminate();
  }, HANDSHAKE_TIMEOUT_MS);

  ws.on('message', (data) => handleMessage(ws, data));
  ws.on('close', (code, reason) => handleClose(ws, code, reason.toString()));
  ws.on('error', (error) => {
    if (ws === socket) {
      lastError =
        error instanceof Error && error.message
          ? `Discord gateway error: ${error.message}`
          : 'Discord gateway error.';
    }
  });
}

function closeMessage(code: number, reason: string): string {
  switch (code) {
    case 4000:
      return 'Discord closed the connection after an unknown gateway error (4000).';
    case 4001:
      return 'Discord rejected an unknown gateway opcode (4001).';
    case 4002:
      return 'Discord rejected a malformed gateway payload (4002).';
    case 4003:
      return 'Discord closed the connection because it was not authenticated (4003).';
    case 4004:
      return 'Discord rejected the token (4004). Copy a fresh token and try again.';
    case 4007:
      return 'Discord rejected the gateway sequence (4007).';
    case 4008:
      return 'Discord is rate limiting this connection (4008).';
    case 4009:
      return 'The Discord gateway session expired (4009).';
    case 4010:
      return 'Discord rejected the shard configuration (4010).';
    case 4011:
      return 'Discord requires sharding for this connection (4011).';
    case 4012:
      return 'Discord rejected the gateway API version (4012).';
    case 4013:
      return 'Discord rejected the gateway intents (4013).';
    case 4014:
      return 'Discord rejected the requested gateway intents (4014). This token cannot be used for presence.';
    default: {
      const detail = reason.trim() ? `: ${truncate(reason.trim(), 120)}` : '';
      return `Discord connection closed (${code})${detail}.`;
    }
  }
}

function handleClose(ws: WebSocket, code: number, reason: string): void {
  if (ws !== socket) return;

  socket = null;
  ready = false;
  connecting = false;
  connectedAt = null;
  clearHeartbeat();
  clearHandshake();

  const message = closeMessage(code, reason);

  if (FATAL_CLOSE_CODES.has(code)) {
    fatal = true;
    token = null;
    lastError = message;
    rejectPending(new Error(message));
    return;
  }

  if (manualClose) return;

  lastError = message;
  if (!ready) rejectPending(new Error(message));
  scheduleReconnect();
}

// ─── Public API ──────────────────────────────────────────────

/** Connect (or replace) the single gateway connection. */
export function connect(tokenValue: string, clientIdValue?: string): Promise<DiscordStatus> {
  const cleanToken = tokenValue.trim();
  if (!cleanToken) {
    return Promise.reject(new Error('Paste a Discord user token.'));
  }
  if (cleanToken.length < 20) {
    return Promise.reject(new Error('That Discord token looks too short. Copy the full token.'));
  }
  if (/\s/.test(cleanToken)) {
    return Promise.reject(new Error('The Discord token contains whitespace. Copy it again.'));
  }

  const cleanClientId = (clientIdValue || '').trim();
  if (cleanClientId && !/^\d{15,25}$/.test(cleanClientId)) {
    return Promise.reject(new Error('The application/client ID must be numeric.'));
  }

  rejectPending(new Error('A new Discord connection replaced this one.'));
  resetConnection();

  token = cleanToken;
  applicationId = cleanClientId || null;
  activity = null;
  connecting = true;

  return new Promise<DiscordStatus>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    openSocket();
  });
}

export function disconnect(): DiscordStatus {
  manualClose = true;
  clearHeartbeat();
  clearHandshake();
  clearReconnect();

  const current = socket;
  socket = null;
  if (current) {
    current.removeAllListeners('message');
    current.removeAllListeners('close');
    current.removeAllListeners('error');
    // Swallow late errors after the listeners are removed.
    current.on('error', () => {});
    try {
      current.close(1000, 'Rem disconnected');
    } catch {
      current.terminate();
    }
  }

  token = null;
  applicationId = null;
  identity = null;
  activity = null;
  ready = false;
  connecting = false;
  fatal = false;
  manualClose = false;
  lastError = null;
  connectedAt = null;
  sequence = null;
  awaitingAck = false;
  reconnectAttempts = 0;

  rejectPending(new Error('Discord was disconnected.'));
  return getStatus();
}

/**
 * Update rich presence. The activity is remembered while reconnecting and is
 * sent again after READY. Throws when no gateway connection is established.
 */
export function setActivity(input: DiscordActivityInput): DiscordStatus {
  if (!input || typeof input.title !== 'string' || !input.title.trim()) {
    throw new Error('Activity title is required.');
  }

  activity = {
    title: truncate(input.title.trim(), 128),
    artist: truncate(
      typeof input.artist === 'string' && input.artist.trim()
        ? input.artist.trim()
        : 'Unknown artist',
      128
    ),
    album:
      typeof input.album === 'string' && input.album.trim()
        ? truncate(input.album.trim(), 128)
        : undefined,
    artwork:
      typeof input.artwork === 'string' && input.artwork.trim()
        ? truncate(input.artwork.trim(), 256)
        : undefined,
    startedAt: normalizeStartedAt(input.startedAt),
    paused: input.paused === true,
  };

  if (!ready) {
    throw new Error('Discord is not connected.');
  }

  sendPresence();
  return getStatus();
}

function resetConnection(): void {
  clearHeartbeat();
  clearHandshake();
  clearReconnect();

  const current = socket;
  socket = null;
  if (current) {
    current.removeAllListeners('message');
    current.removeAllListeners('close');
    current.removeAllListeners('error');
    current.on('error', () => {});
    try {
      current.close(1000, 'Rem reconnected');
    } catch {
      current.terminate();
    }
  }

  ready = false;
  connecting = false;
  manualClose = false;
  fatal = false;
  lastError = null;
  connectedAt = null;
  sequence = null;
  awaitingAck = false;
  reconnectAttempts = 0;
  identity = null;
}
