import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Clock3, Heart, Home, Library, Search, Settings } from 'lucide-react';
import { useLibraryStore } from '@/state/library';
import { SearchField } from '@/components/music/SearchField';
import { usePlayerStore } from '@/state/player';

export function Sidebar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const liked = useLibraryStore((s) => s.liked.length);
  const recent = useLibraryStore((s) => s.recent.length);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const submit = (value: string) => {
    if (!value) return;
    navigate(`/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <aside className="sidebar" aria-label="Primary">
      <NavLink to="/" className="brand" aria-label="Rem home">
        <span className="brand-mark">R</span>
        <span className="brand-name">Rem</span>
      </NavLink>

      <SearchField
        value={query}
        onChange={setQuery}
        onSubmit={submit}
        placeholder="Search"
      />

      <nav className="nav-group" aria-label="Browse">
        <NavLink to="/" end className="nav-item">
          <Home size={17} className="nav-icon" />
          Home
        </NavLink>
        <NavLink to="/search" className="nav-item">
          <Search size={17} className="nav-icon" />
          Search
        </NavLink>
      </nav>

      <nav className="nav-group" aria-label="Library">
        <div className="nav-label">Library</div>
        <NavLink to="/library?tab=liked" className="nav-item">
          <Heart size={17} className="nav-icon" />
          Favourites
          {liked > 0 && <span className="ml-auto t-footnote t-tertiary">{liked}</span>}
        </NavLink>
        <NavLink to="/library?tab=recent" className="nav-item">
          <Clock3 size={17} className="nav-icon" />
          Recently Played
          {recent > 0 && <span className="ml-auto t-footnote t-tertiary">{recent}</span>}
        </NavLink>
        <NavLink to="/library" end className="nav-item">
          <Library size={17} className="nav-icon" />
          All Library
        </NavLink>
      </nav>

      <div className="mt-auto nav-group">
        {currentTrack && (
          <div className="px-2.5 pb-2">
            <div className="t-caption uppercase tracking-[0.06em] text-[var(--systemTertiary)]">
              Now playing
            </div>
            <div className="truncate t-callout-em mt-1">{currentTrack.title}</div>
            <div className="truncate t-footnote t-secondary">{currentTrack.artist}</div>
          </div>
        )}
        <NavLink to="/settings" className="nav-item">
          <Settings size={17} className="nav-icon" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
