import { getApiBase } from '@/config';
import type {
  PartyEvent,
  PartyPlayback,
  PartyRole,
  PartyTrack,
  WelcomeEvent,
} from './types';

const PING_INTERVAL_MS = 4_000;
const RECONNECT_DELAY_MS = 2_000;

export interface PartyClientOptions {
  room: string;
  name: string;
  role: PartyRole;
  token?: string;
  onEvent: (event: PartyEvent) => void;
}

function wsBase(): string {
  const api = getApiBase();
  if (api.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return api.replace(/^http/, 'ws').replace(/\/$/, '');
}

export class PartyClient {
  readonly role: PartyRole;
  private socket: WebSocket | null = null;
  private options: PartyClientOptions;
  private attempt = 0;
  private disposed = false;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private offsets: number[] = [];

  constructor(options: PartyClientOptions) {
    this.options = options;
    this.role = options.role;
  }

  connect(): void {
    this.disposed = false;
    const params = new URLSearchParams({
      room: this.options.room,
      name: this.options.name,
      role: this.options.role,
    });
    if (this.options.token) params.set('token', this.options.token);

    this.options.onEvent({ type: 'connection', status: 'connecting', attempt: this.attempt });
    const socket = new WebSocket(`${wsBase()}/api/party/ws?${params.toString()}`);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.options.onEvent({ type: 'connection', status: 'open', attempt: 0 });
      this.startPing();
    };

    socket.onmessage = (event) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      this.handleMessage(payload);
    };

    socket.onclose = () => {
      this.stopPing();
      if (this.disposed) return;
      this.options.onEvent({ type: 'connection', status: 'closed', attempt: this.attempt });
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      if (!this.disposed) socket.close();
    };
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, ...payload }));
    }
  }

  sendPing(): void {
    this.send('ping', { clientTime: performance.now() });
  }

  dispose(): void {
    this.disposed = true;
    this.stopPing();
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.socket?.close(1000, 'left');
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS * Math.min(4, this.attempt));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => this.sendPing(), PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private handleMessage(payload: Record<string, unknown>): void {
    const type = String(payload.type || '');
    const clockOffset = typeof payload.serverTime === 'number' ? payload.serverTime - Date.now() : null;

    switch (type) {
      case 'welcome': {
        this.options.onEvent({
          type: 'welcome',
          welcome: payload as unknown as WelcomeEvent,
        });
        break;
      }
      case 'members':
        this.options.onEvent({ type: 'members', members: payload.members as never });
        break;
      case 'state':
        this.options.onEvent({
          type: 'state',
          playback: payload.playback as PartyPlayback,
          queue: (payload.queue || []) as PartyTrack[],
          queueIndex: Number(payload.queueIndex ?? 0),
          contextLabel: String(payload.contextLabel || ''),
          from: typeof payload.from === 'string' ? payload.from : undefined,
        });
        break;
      case 'queue':
        this.options.onEvent({
          type: 'queue',
          queue: (payload.queue || []) as PartyTrack[],
          queueIndex: Number(payload.queueIndex ?? 0),
          contextLabel: String(payload.contextLabel || ''),
        });
        break;
      case 'control':
        this.options.onEvent({
          type: 'control',
          action: payload.action as never,
          position: typeof payload.position === 'number' ? payload.position : undefined,
          by: typeof payload.by === 'string' ? payload.by : undefined,
        });
        break;
      case 'activity':
        this.options.onEvent({ type: 'activity', message: String(payload.message || '') });
        break;
      case 'pong': {
        const clientTime = typeof payload.clientTime === 'number' ? payload.clientTime : null;
        const latency = clientTime === null ? 0 : Math.max(0, performance.now() - clientTime);
        if (clockOffset !== null) {
          this.offsets.push(clockOffset);
          if (this.offsets.length > 8) this.offsets.shift();
        }
        this.options.onEvent({ type: 'pong', latency, serverTime: Number(payload.serverTime) });
        break;
      }
      case 'bye':
        this.options.onEvent({ type: 'bye', reason: String(payload.reason || '') });
        break;
      case 'error':
        this.options.onEvent({ type: 'error', message: String(payload.message || '') });
        break;
      default:
        break;
    }
  }

  clockOffset(): number {
    if (!this.offsets.length) return 0;
    return this.offsets.reduce((sum, value) => sum + value, 0) / this.offsets.length;
  }
}

export function createPartyClient(options: PartyClientOptions): PartyClient {
  return new PartyClient(options);
}

/** Convert a server-side party track into a Rem playback track. */
export function partyToTrack(item: PartyTrack): PartyTrack & { streamUrl: string } {
  return {
    ...item,
    streamUrl: `/api/stream/${encodeURIComponent(item.id)}`,
  };
}
