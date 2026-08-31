/**
 * AppLayout — main application layout.
 * Sidebar (desktop) + content area + player bar + tab bar (mobile) + root overlays (NowPlayingView, QueuePanel, TrackDetailsModal).
 */

import { Sidebar } from './Sidebar';
import { PlayerBar } from '../Player/PlayerBar';
import { NowPlayingView } from '../Player/NowPlayingView';
import { QueuePanel } from '../Queue/QueuePanel';
import { TrackDetailsModal } from '../Player/TrackDetailsModal';
import { TabBar } from '../common/TabBar';
import { useUIStore } from '../../stores/uiStore';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isQueueOpen } = useUIStore();

  return (
    <div className="h-dvh w-dvw flex flex-col app-shell overflow-hidden">
      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar (desktop only) */}
        <Sidebar />

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-hidden">
          {children}
        </main>
      </div>

      {/* ── Bottom stack ── */}
      <div className="flex-shrink-0">
        {/* Player bar */}
        <PlayerBar />

        {/* Tab bar (mobile only) */}
        <div className="md:hidden">
          <TabBar />
        </div>
      </div>

      {/* ── Root Overlays (Rendered at top-level stacking context) ── */}
      <NowPlayingView />
      {isQueueOpen && <QueuePanel />}
      <TrackDetailsModal />
    </div>
  );
}
