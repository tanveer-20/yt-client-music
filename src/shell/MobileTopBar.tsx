import { Link, NavLink } from 'react-router-dom';
import { Search, Settings } from 'lucide-react';

export function MobileTopBar() {
  return (
    <header className="mobile-top-bar">
      <Link to="/" className="brand" aria-label="Rem home">
        <span className="brand-mark" style={{ width: 26, height: 26, fontSize: 15 }}>
          R
        </span>
        <span className="brand-name" style={{ fontSize: 17 }}>
          Rem
        </span>
      </Link>
      <div className="row gap-1">
        <NavLink to="/search" className="icon-btn" aria-label="Search">
          <Search size={18} />
        </NavLink>
        <NavLink to="/settings" className="icon-btn" aria-label="Settings">
          <Settings size={18} />
        </NavLink>
      </div>
    </header>
  );
}
