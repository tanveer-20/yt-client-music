import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBase } from '@/config';
import { usePlayerStore } from '@/state/player';
import { createPartyClient, type PartyClient } from './client';
import type { PartyMember, PartyPlayback, PartyRole, PartyTrack, WelcomeEvent } from './types';

export type PartyStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

interface PartyState {
  status: PartyStatus;
  role: PartyRole | null;
  welcome: WelcomeEvent | null;
  members: PartyMember[];
  playback: PartyPlayback | null;
  queue: PartyTrack[];
  queueIndex: number;
  contextLabel: string;
  latency: number | null;
  activity: string | null;
  error: string | null;
  closedReason: string | null;
}

const initial: PartyState = {
  status: 'idle',
  role: null,
  welcome: null,
  members: [],
  playback: null,
  queue: [],
  queueIndex: 0,
  contextLabel: '',
  latency: null,
  activity: null,
  error: null,
  closedReason: null,
};

function toTrack(item: PartyTrack) {
  const base = getApiBase();
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    album: item.album,
    thumbnail: item.thumbnail || '',
    duration: item.duration || 0,
    streamUrl: `${base}/stream/${encodeURIComponent(item.id)}`,
  };
}

export function useParty() {
  const [state, setState] = useState<PartyState>(initial);
  const clientRef = useRef<PartyClient | null>(null);
  const unsubRef = useRef<Array<() => void>>([]);
  const lastProgressSent = useRef(0);

  const disconnect = useCallback(() => {
    unsubRef.current.forEach((unsubscribe) => unsubscribe());
    unsubRef.current = [];
    clientRef.current?.dispose();
    clientRef.current = null;
    setState({ ...initial });
  }, []);

  const sendHostState = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const store = usePlayerStore.getState();
    if (!store.currentTrack) return;
    client.send('state', {
      playback: {
        trackId: store.currentTrack.id,
        title: store.currentTrack.title,
        artist: store.currentTrack.artist,
        album: store.currentTrack.album,
        artwork: store.currentTrack.thumbnail,
        duration: store.duration,
        position: store.progress,
        playing: store.state === 'playing',
      },
      queue: store.queue.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        thumbnail: track.thumbnail,
        duration: track.duration,
      })),
      index: store.queueIndex,
      contextLabel: store.contextLabel,
    });
  }, []);

  const connect = useCallback(
    (options: { room: string; name: string; role: PartyRole; token?: string }) => {
      disconnect();
      setState({ ...initial, status: 'connecting' });

      const client = createPartyClient({
        room: options.room,
        name: options.name,
        role: options.role,
        token: options.token,
        onEvent: (event) => {
          switch (event.type) {
            case 'connection':
              setState((prev) => ({
                ...prev,
                status: event.status === 'open' ? 'connected' : event.status === 'connecting' ? 'connecting' : 'reconnecting',
              }));
              break;
            case 'welcome':
              setState((prev) => ({
                ...prev,
                welcome: event.welcome,
                role: event.welcome.role,
                members: event.welcome.members,
                playback: event.welcome.playback,
                queue: event.welcome.queue,
                queueIndex: event.welcome.queueIndex,
                contextLabel: event.welcome.contextLabel,
              }));
              client.sendPing();
              if (event.welcome.role === 'host') {
                const unsubscribe = usePlayerStore.subscribe((store, previous) => {
                  const now = Date.now();
                  const significant =
                    store.currentTrack?.id !== previous.currentTrack?.id ||
                    store.state !== previous.state ||
                    store.queue.length !== previous.queue.length ||
                    store.queueIndex !== previous.queueIndex ||
                    store.seekNonce !== previous.seekNonce;
                  const throttled =
                    store.state === 'playing' && now - lastProgressSent.current > 1000;
                  if (significant || throttled) {
                    lastProgressSent.current = now;
                    sendHostState();
                  }
                });
                unsubRef.current.push(unsubscribe);
              }
              break;
            case 'members':
              setState((prev) => ({ ...prev, members: event.members }));
              break;
            case 'state':
              setState((prev) => ({
                ...prev,
                playback: event.playback,
                queue: event.queue,
                queueIndex: event.queueIndex,
                contextLabel: event.contextLabel,
              }));
              if (client.role === 'guest') {
                const track = event.queue[event.queueIndex];
                if (track) {
                  const player = usePlayerStore.getState();
                  if (player.currentTrack?.id !== track.id) {
                    player.playQueue(event.queue.map(toTrack), event.queueIndex, event.contextLabel);
                  }
                }
              }
              break;
            case 'queue':
              setState((prev) => ({ ...prev, queue: event.queue, queueIndex: event.queueIndex, contextLabel: event.contextLabel }));
              if (client.role === 'guest') {
                const player = usePlayerStore.getState();
                const currentInQueue = event.queue.find((item) => item.id === player.currentTrack?.id);
                const nextIndex = currentInQueue
                  ? event.queue.findIndex((item) => item.id === currentInQueue.id)
                  : event.queueIndex;
                player.playQueue(event.queue.map(toTrack), nextIndex, event.contextLabel);
              }
              break;
            case 'control': {
              if (client.role !== 'guest') break;
              const player = usePlayerStore.getState();
              if (event.action === 'play') player.play();
              else if (event.action === 'pause') player.pause();
              else if (event.action === 'seek' && typeof event.position === 'number') player.seek(event.position);
              else if (event.action === 'next') player.next();
              else if (event.action === 'prev') player.previous();
              break;
            }
            case 'pong':
              setState((prev) => ({ ...prev, latency: Math.round(event.latency) }));
              break;
            case 'activity':
              setState((prev) => ({ ...prev, activity: event.message }));
              break;
            case 'error':
              setState((prev) => ({ ...prev, error: event.message }));
              break;
            case 'bye':
              setState((prev) => ({ ...prev, status: 'closed', closedReason: event.reason }));
              clientRef.current?.dispose();
              break;
          }
        },
      });

      clientRef.current = client;
      client.connect();
    },
    [disconnect, sendHostState]
  );

  useEffect(() => disconnect, [disconnect]);

  const leave = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const createRoom = useCallback(
    async (name: string, hostName: string) => {
      const res = await fetch(`${getApiBase()}/party`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hostName }),
      });
      const payload = (await res.json()) as { code?: string; token?: string; hostName?: string };
      if (!res.ok || !payload.code || !payload.token) {
        throw new Error('Could not create a Listen Together room.');
      }
      connect({ room: payload.code, name: hostName, role: 'host', token: payload.token });
      return payload;
    },
    [connect]
  );

  const control = useCallback((action: 'play' | 'pause' | 'seek' | 'next' | 'prev', position?: number) => {
    clientRef.current?.send('control', { action, position });
    if (action === 'play') usePlayerStore.getState().play();
    if (action === 'pause') usePlayerStore.getState().pause();
    if (action === 'seek' && typeof position === 'number') usePlayerStore.getState().seek(position);
    if (action === 'next') usePlayerStore.getState().next();
    if (action === 'prev') usePlayerStore.getState().previous();
  }, []);

  const kick = useCallback((memberId: string) => {
    clientRef.current?.send('kick', { memberId });
  }, []);

  return {
    ...state,
    connect: (options: { room: string; name: string; role?: PartyRole }) =>
      connect({ ...options, role: options.role || 'guest' }),
    createRoom,
    leave,
    control,
    kick,
    sendHostState,
  };
}
