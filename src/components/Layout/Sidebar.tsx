import {
  RiHome5Fill,
  RiHome5Line,
  RiSearchLine,
  RiSearchFill,
  RiMusic2Fill,
  RiMusic2Line,
  RiAddLine,
  RiPlayFill,
  RiHeartFill,
  RiSettings3Fill,
  RiSettings3Line,
} from 'react-icons/ri';
import { useUIStore } from '../../stores/uiStore';
import { usePlaylistStore } from '../../stores/playlistStore';
import type { View } from '../../types';

interface NavItem {
  view: View;
  label: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    view: 'home',
    label: 'Home',
    icon: <RiHome5Line size={22} />,
    activeIcon: <RiHome5Fill size={22} />,
  },
  {
    view: 'search',
    label: 'Search',
    icon: <RiSearchLine size={22} />,
    activeIcon: <RiSearchFill size={22} />,
  },
  {
    view: 'playlists',
    label: 'Library',
    icon: <RiMusic2Line size={22} />,
    activeIcon: <RiMusic2Fill size={22} />,
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: <RiSettings3Line size={22} />,
    activeIcon: <RiSettings3Fill size={22} />,
  },
];

export function Sidebar() {
  const { currentView, activePlaylistId, setView, navigateToPlaylist } = useUIStore();
  const { playlists, favorites, createPlaylist } = usePlaylistStore();

  return (
    <aside className="hidden md:flex flex-col w-60 h-full glass border-r border-white/[0.06]">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
            <RiPlayFill size={16} className="text-white ml-0.5" />
          </div>
          <span className="text-lg font-bold tracking-tight">YT Music</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-3 mb-4">
        {navItems.map((item) => {
          const isActive =
            currentView === item.view ||
            (item.view === 'playlists' && currentView === 'playlist-detail');

          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 mb-0.5
                ${isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
                }`}
            >
              {isActive ? item.activeIcon : item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="border-t border-white/[0.06] mx-4 mb-3" />

      {/* Playlists */}
      <div className="flex-1 overflow-y-auto px-3">
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">
            Playlists
          </span>
          <button
            onClick={() => {
              const name = `Playlist ${playlists.length + 1}`;
              const id = createPlaylist(name);
              navigateToPlaylist(id);
            }}
            className="p-1 rounded-lg hover:bg-white/[0.08] transition-colors text-white/30 hover:text-white"
            aria-label="Create playlist"
          >
            <RiAddLine size={16} />
          </button>
        </div>

        {/* Liked Songs Entry */}
        <button
          onClick={() => navigateToPlaylist('favorites')}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm
            transition-all duration-200 mb-1
            ${currentView === 'playlist-detail' && activePlaylistId === 'favorites'
              ? 'bg-white/[0.08] text-white'
              : 'text-white/70 hover:text-white hover:bg-white/[0.04]'
            }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-brand-600 flex items-center justify-center flex-shrink-0">
            <RiHeartFill size={15} className="text-white" />
          </div>
          <div className="min-w-0 text-left">
            <p className="line-clamp-1 font-medium">Liked Songs</p>
            <p className="text-xs text-white/30">
              {favorites.length} track{favorites.length !== 1 ? 's' : ''}
            </p>
          </div>
        </button>

        {playlists.length > 0 ? (
          <div className="space-y-0.5">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => navigateToPlaylist(pl.id)}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm
                  transition-all duration-200
                  ${currentView === 'playlist-detail' && pl.id === activePlaylistId
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/45 hover:text-white hover:bg-white/[0.04]'
                  }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                  {pl.tracks.length > 0 ? (
                    <img
                      src={pl.tracks[0].thumbnail}
                      alt=""
                      className="w-full h-full rounded-lg object-cover"
                    />
                  ) : (
                    <RiMusic2Line size={14} className="text-white/20" />
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <p className="line-clamp-1">{pl.name}</p>
                  <p className="text-xs text-white/25">
                    {pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/20 px-3">No playlists</p>
        )}
      </div>
    </aside>
  );
}
