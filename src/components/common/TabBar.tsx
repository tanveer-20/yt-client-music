/**
 * iOS-style bottom tab bar for mobile navigation.
 */

import {
  RiHome5Fill,
  RiHome5Line,
  RiSearchLine,
  RiSearchFill,
  RiMusic2Fill,
  RiMusic2Line,
  RiSettings3Fill,
  RiSettings3Line,
} from 'react-icons/ri';
import { useUIStore } from '../../stores/uiStore';
import type { View } from '../../types';

interface TabItem {
  view: View;
  label: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
}

const tabs: TabItem[] = [
  {
    view: 'home',
    label: 'Home',
    icon: <RiHome5Line size={24} />,
    activeIcon: <RiHome5Fill size={24} />,
  },
  {
    view: 'search',
    label: 'Search',
    icon: <RiSearchLine size={24} />,
    activeIcon: <RiSearchFill size={24} />,
  },
  {
    view: 'playlists',
    label: 'Library',
    icon: <RiMusic2Line size={24} />,
    activeIcon: <RiMusic2Fill size={24} />,
  },
  {
    view: 'settings',
    label: 'Settings',
    icon: <RiSettings3Line size={24} />,
    activeIcon: <RiSettings3Fill size={24} />,
  },
];

export function TabBar() {
  const { currentView, setView } = useUIStore();

  return (
    <nav className="tab-bar border-t border-white/[0.08]" role="navigation" aria-label="Bottom Navigation">
      <div className="flex items-center justify-around w-full max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive =
            currentView === tab.view ||
            (tab.view === 'playlists' && currentView === 'playlist-detail');

          return (
            <button
              key={tab.view}
              onClick={() => setView(tab.view)}
              className={`tab-item group relative transition-all duration-200 ${
                isActive ? 'tab-item-active font-semibold' : 'tab-item-inactive'
              }`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center">
                {isActive ? tab.activeIcon : tab.icon}
              </div>
              <span className="text-[11px] leading-tight mt-0.5 tracking-tight font-medium">
                {tab.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-brand-500 mt-0.5 transition-all duration-300" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
