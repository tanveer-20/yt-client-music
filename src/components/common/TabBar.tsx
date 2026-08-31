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
    <nav className="tab-bar border-t border-white/[0.06]">
      {tabs.map((tab) => {
        const isActive =
          currentView === tab.view ||
          (tab.view === 'playlists' && currentView === 'playlist-detail');

        return (
          <button
            key={tab.view}
            onClick={() => setView(tab.view)}
            className={`tab-item ${isActive ? 'tab-item-active' : 'tab-item-inactive'}`}
          >
            {isActive ? tab.activeIcon : tab.icon}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
