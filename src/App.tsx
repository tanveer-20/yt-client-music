/**
 * App — root component. Renders the layout, active view, and modals.
 */

import { useEffect } from 'react';
import { AppLayout } from './components/Layout/AppLayout';
import { HomePage } from './components/Home/HomePage';
import { SearchView } from './components/Search/SearchView';
import { PlaylistListView, PlaylistDetailView } from './components/Playlist/PlaylistView';
import { SettingsView } from './components/Settings/SettingsView';
import { TrackDetailsModal } from './components/Player/TrackDetailsModal';
import { useUIStore } from './stores/uiStore';
import { useSettingsStore } from './stores/settingsStore';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function AppContent() {
  const { currentView } = useUIStore();

  switch (currentView) {
    case 'home':
      return <HomePage />;
    case 'search':
      return <SearchView />;
    case 'playlists':
      return <PlaylistListView />;
    case 'playlist-detail':
      return <PlaylistDetailView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <HomePage />;
  }
}

export default function App() {
  // Initialize audio player and keyboard shortcuts
  useAudioPlayer();
  useKeyboardShortcuts();

  // Apply theme on initial load
  useEffect(() => {
    const theme = useSettingsStore.getState().theme;
    useSettingsStore.getState().setTheme(theme);
  }, []);

  return (
    <AppLayout>
      <AppContent />
    </AppLayout>
  );
}
