import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileTopBar } from './MobileTopBar';
import { PlayerBar } from './PlayerBar';
import { FullScreenPlayer } from './FullScreenPlayer';
import { UpNext } from './UpNext';
import { LyricsPanel } from './LyricsPanel';
import { MeshBackdrop } from './MeshBackdrop';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useReplayRecorder } from '@/replay/useReplayRecorder';
import { setDiscordActivity } from '@/data/integrations/api';
import { useIntegrationsStore } from '@/state/integrations';
import { usePlayerStore } from '@/state/player';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export function AppShell() {
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useKeyboardShortcuts();
  useReplayRecorder();

  useEffect(() => {
    if (!useIntegrationsStore.getState().discordShareNowPlaying) return;
    return usePlayerStore.subscribe((state, previous) => {
      if (state.currentTrack?.id === previous.currentTrack?.id && state.state === previous.state) return;
      const track = state.currentTrack;
      if (!track) return;
      void setDiscordActivity({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.thumbnail,
        startedAt: Date.now(),
        paused: state.state !== 'playing',
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname, location.search]);

  return (
    <div className="app-shell">
      <MeshBackdrop />
      <Sidebar />

      <div className="main-column">
        <MobileTopBar />
        <main ref={scrollRef} className="page-scroll scroll-area" id="main-scroll">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <PlayerBar />
      <UpNext />
      <LyricsPanel />
      <FullScreenPlayer />
    </div>
  );
}
