export type PartyRole = 'host' | 'guest';

export interface PartyMember {
  id: string;
  name: string;
  role: PartyRole;
  colour: string;
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

export interface PartyTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration: number;
}

export interface PartyRoomSummary {
  code: string;
  name: string;
  hostName: string;
  memberCount: number;
  paused: boolean;
  queueLength: number;
  playback: PartyPlayback | null;
  expiresAt: number;
}

export interface WelcomeEvent {
  memberId: string;
  role: PartyRole;
  colour: string;
  room: { code: string; name: string; hostName: string };
  members: PartyMember[];
  playback: PartyPlayback | null;
  queue: PartyTrack[];
  queueIndex: number;
  contextLabel: string;
}

export type PartyEvent =
  | { type: 'welcome'; welcome: WelcomeEvent }
  | { type: 'members'; members: PartyMember[] }
  | { type: 'state'; playback: PartyPlayback; queue: PartyTrack[]; queueIndex: number; contextLabel: string; from?: string }
  | { type: 'queue'; queue: PartyTrack[]; queueIndex: number; contextLabel: string }
  | { type: 'control'; action: 'play' | 'pause' | 'seek' | 'next' | 'prev'; position?: number; by?: string }
  | { type: 'activity'; message: string }
  | { type: 'pong'; latency: number; serverTime: number }
  | { type: 'bye'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'connection'; status: 'connecting' | 'open' | 'closed'; attempt: number };
