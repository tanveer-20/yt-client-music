/**
 * Listen Together room service.
 *
 * REST routes create and inspect rooms; the WebSocket server syncs playback.
 * Room state is intentionally in-memory: a room disappears when the server
 * restarts and empty rooms expire after 10 minutes.
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';

const ROOM_TTL_MS = 10 * 60_000;
const MAX_MEMBERS = 24;
const MAX_QUEUE = 500;
const MAX_FRAME_BYTES = 512 * 1024;
const HOST_PORT_COLOURS = ['#fa586a', '#7d7aff', '#25c685', '#ff8a3d', '#36c2ce', '#c07cff'];

export type PartyRole = 'host' | 'guest';

export interface PartyMember {
  id: string;
  name: string;
  role: PartyRole;
  colour: string;
  socket: WebSocket;
}

export interface PartyPlayback {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration: number;
  position: number;
  playing: boolean;
  updatedAt: number;
}

export interface PartyRoom {
  code: string;
  token: string;
  hostId: string;
  name: string;
  hostName: string;
  createdAt: number;
  members: Map<string, PartyMember>;
  playback: PartyPlayback | null;
  queue: Array<Record<string, unknown>>;
  queueIndex: number;
  contextLabel: string;
  paused: boolean;
  lastActivityAt: number;
}

interface Frame {
  type?: unknown;
  [key: string]: unknown;
}

export interface RoomSummary {
  code: string;
  name: string;
  hostName: string;
  memberCount: number;
  paused: boolean;
  queueLength: number;
  playback: PartyPlayback | null;
  expiresAt: number;
}

const rooms = new Map<string, PartyRoom>();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function code(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function token(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function validCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{5,8}$/.test(value.toUpperCase());
}

function normaliseName(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, 32);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function send(socket: WebSocket, type: string, payload: Record<string, unknown> = {}): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }));
  }
}

function memberList(room: PartyRoom): Array<Omit<PartyMember, 'socket'>> {
  return [...room.members.values()].map(({ socket, ...member }) => member);
}

function broadcast(room: PartyRoom, type: string, payload: Record<string, unknown> = {}): void {
  const message = JSON.stringify({ type, ...payload });
  for (const member of room.members.values()) {
    if (member.socket.readyState === WebSocket.OPEN) member.socket.send(message);
  }
}

function publicState(room: PartyRoom) {
  return {
    playback: room.playback,
    queue: room.queue,
    queueIndex: room.queueIndex,
    contextLabel: room.contextLabel,
    paused: room.paused,
  };
}

function validatePlayback(input: unknown): PartyPlayback | null {
  if (!isPlainObject(input)) return null;
  const trackId = String(input.trackId || '');
  const title = String(input.title || '');
  if (!trackId || !title) return null;
  const duration = Number(input.duration || 0) || 0;
  const position = Math.max(0, Number(input.position || 0) || 0);
  return {
    trackId,
    title: title.slice(0, 160),
    artist: String(input.artist || 'Unknown artist').slice(0, 120),
    album: typeof input.album === 'string' ? input.album.slice(0, 160) : undefined,
    artwork: typeof input.artwork === 'string' ? input.artwork : undefined,
    duration: Math.min(2 * 60 * 60 * 1000, duration),
    position: Math.min(duration || Infinity, position),
    playing: input.playing === true,
    updatedAt: Date.now(),
  };
}

function validateQueue(input: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_QUEUE) return null;
  return input.filter((item) => isPlainObject(item) && typeof item.id === 'string');
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export function createRoom(input: { name?: unknown; hostName?: unknown }): {
  code: string;
  token: string;
  hostName: string;
  name: string;
} {
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();
  const hostName = normaliseName(input.hostName, 'Host');
  const name = normaliseName(input.name, `${hostName}'s room`);
  const room: PartyRoom = {
    code: roomCode,
    token: token(),
    hostId: '',
    name,
    hostName,
    createdAt: Date.now(),
    members: new Map(),
    playback: null,
    queue: [],
    queueIndex: -1,
    contextLabel: '',
    paused: true,
    lastActivityAt: Date.now(),
  };
  rooms.set(roomCode, room);
  return { code: room.code, token: room.token, hostName, name };
}

export function getRoomSummary(roomCode: string): RoomSummary | null {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return null;
  return {
    code: room.code,
    name: room.name,
    hostName: room.hostName,
    memberCount: room.members.size,
    paused: room.paused,
    queueLength: room.queue.length,
    playback: room.playback,
    expiresAt: room.createdAt + ROOM_TTL_MS,
  };
}

export function closeRoom(roomCode: string, bearer: string | undefined): { closed: boolean } {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) throw new Error('Room not found.');
  if (!bearer || bearer.trim() !== room.token) throw new Error('Only the host can close this room.');
  rooms.delete(room.code);
  broadcast(room, 'bye', { reason: 'The host closed the room.' });
  for (const member of room.members.values()) member.socket.close(1000, 'room-closed');
  return { closed: true };
}

export function roomCount(): number {
  return rooms.size;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export function attachPartyServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/api/party/ws', maxPayload: MAX_FRAME_BYTES });

  const expiry = setInterval(() => {
    const now = Date.now();
    for (const [roomCode, room] of rooms) {
      if (room.members.size === 0 && now - room.lastActivityAt > ROOM_TTL_MS) {
        rooms.delete(roomCode);
      }
    }
  }, 60_000);
  expiry.unref?.();

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const rawQuery = (request.url || '').split('?')[1] || '';
    const query = new URLSearchParams(rawQuery);
    const roomCode = String(query.get('room') || '').toUpperCase();
    if (!validCode(roomCode)) {
      send(socket, 'error', { message: 'Invalid room code.' });
      socket.close();
      return;
    }
    const room = rooms.get(roomCode);
    if (!room) {
      send(socket, 'error', { message: 'This room does not exist.' });
      socket.close();
      return;
    }
    if (room.members.size >= MAX_MEMBERS) {
      send(socket, 'error', { message: 'This room is full.' });
      socket.close();
      return;
    }

    const providedToken = query.get('token') || '';
    const requestedRole = query.get('role') === 'guest' ? 'guest' : query.get('role') === 'host' ? 'host' : 'guest';
    if (requestedRole === 'host' && providedToken !== room.token) {
      send(socket, 'error', { message: 'Host token is missing or invalid.' });
      socket.close();
      return;
    }

    const memberId = `m${Math.random().toString(36).slice(2, 10)}`;
    const role: PartyRole = requestedRole === 'host' ? 'host' : 'guest';
    const member: PartyMember = {
      id: memberId,
      name: normaliseName(query.get('name'), role === 'host' ? room.hostName : `Guest ${room.members.size + 1}`),
      role,
      colour: HOST_PORT_COLOURS[room.members.size % HOST_PORT_COLOURS.length],
      socket,
    };
    room.members.set(memberId, member);
    room.lastActivityAt = Date.now();
    if (role === 'host') room.hostId = memberId;

    send(socket, 'welcome', {
      memberId,
      role,
      colour: member.colour,
      serverTime: Date.now(),
      room: { code: room.code, name: room.name, hostName: room.hostName },
      members: memberList(room),
      ...publicState(room),
    });
    broadcast(room, 'members', { members: memberList(room) });

    socket.on('message', (data: RawData) => {
      let frame: Frame;
      try {
        frame = JSON.parse(String(data)) as Frame;
      } catch {
        send(socket, 'error', { message: 'Malformed frame.' });
        return;
      }
      if (!room.members.has(memberId)) return;
      room.lastActivityAt = Date.now();

      switch (frame.type) {
        case 'state': {
          if (role !== 'host') return;
          const playback = validatePlayback(frame.playback);
          if (!playback) {
            send(socket, 'error', { message: 'Invalid playback state.' });
            return;
          }
          room.playback = playback;
          room.paused = !playback.playing;
          const queue = frame.queue === undefined ? room.queue : validateQueue(frame.queue);
          if (queue === null) {
            send(socket, 'error', { message: 'Invalid queue.' });
            return;
          }
          room.queue = queue;
          const index = Number(frame.index);
          room.queueIndex = Number.isFinite(index) && index >= 0 ? index : room.queueIndex;
          room.contextLabel = typeof frame.contextLabel === 'string' ? frame.contextLabel.slice(0, 120) : room.contextLabel;
          broadcast(room, 'state', { playback, queue: room.queue, queueIndex: room.queueIndex, contextLabel: room.contextLabel, from: memberId });
          break;
        }
        case 'control': {
          const action = String(frame.action);
          if (!['play', 'pause', 'seek', 'next', 'prev'].includes(action)) {
            send(socket, 'error', { message: 'Unknown control action.' });
            return;
          }
          if (role !== 'host' && action !== 'play') {
            // Guests can ask to resume but cannot navigate or seek.
          }
          const position = Number(frame.position);
          broadcast(room, 'control', {
            action,
            position: Number.isFinite(position) && position >= 0 ? position : undefined,
            by: memberId,
          });
          if (action === 'play') room.paused = false;
          if (action === 'pause') room.paused = true;
          break;
        }
        case 'queue': {
          if (role !== 'host') return;
          const queue = validateQueue(frame.queue);
          if (!queue) {
            send(socket, 'error', { message: 'Invalid queue.' });
            return;
          }
          room.queue = queue;
          const index = Number(frame.index);
          room.queueIndex = Number.isFinite(index) && index >= 0 ? index : room.queueIndex;
          room.contextLabel = typeof frame.contextLabel === 'string' ? frame.contextLabel.slice(0, 120) : room.contextLabel;
          broadcast(room, 'queue', { queue, queueIndex: room.queueIndex, contextLabel: room.contextLabel, from: memberId });
          break;
        }
        case 'ping': {
          const clientTime = Number(frame.clientTime);
          send(socket, 'pong', {
            clientTime: Number.isFinite(clientTime) ? clientTime : undefined,
            serverTime: Date.now(),
          });
          break;
        }
        case 'kick': {
          if (role !== 'host') {
            send(socket, 'error', { message: 'Only the host can remove a member.' });
            return;
          }
          const targetId = String(frame.memberId);
          const target = room.members.get(targetId);
          if (target && targetId !== memberId) {
            send(target.socket, 'bye', { reason: 'The host removed you from the room.' });
            target.socket.close(1000, 'kicked');
          }
          break;
        }
        default:
          break;
      }
    });

    socket.on('close', () => {
      room.members.delete(memberId);
      room.lastActivityAt = Date.now();
      broadcast(room, 'members', { members: memberList(room) });

      if (room.members.size === 0) {
        room.lastActivityAt = Date.now();
        return;
      }
      if (room.hostId === memberId) {
        const next = [...room.members.values()][0];
        next.role = 'host';
        room.hostId = next.id;
        room.hostName = next.name;
        broadcast(room, 'activity', { message: `${next.name} is now hosting.`, members: memberList(room) });
      }
    });

    socket.on('error', () => {
      room.members.delete(memberId);
    });
  });
}
