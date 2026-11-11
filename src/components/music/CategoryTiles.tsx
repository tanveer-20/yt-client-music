import { useNavigate } from 'react-router-dom';
import { Disc3, Heart, Headphones, Mic2, Music2, Radio, Sparkles, Guitar } from 'lucide-react';
import type { ComponentType } from 'react';

interface Genre {
  label: string;
  color: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const GENRES: Genre[] = [
  { label: 'Pop', color: '#e8115b', Icon: Music2 },
  { label: 'Hip-Hop', color: '#ba5d07', Icon: Mic2 },
  { label: 'Rock', color: '#8d67ab', Icon: Guitar },
  { label: 'R&B', color: '#477d95', Icon: Heart },
  { label: 'Electronic', color: '#27856a', Icon: Disc3 },
  { label: 'Jazz', color: '#7950f2', Icon: Sparkles },
  { label: 'Classical', color: '#7d4b32', Icon: Radio },
  { label: 'Indie', color: '#e13300', Icon: Headphones },
  { label: 'Latin', color: '#f037a5', Icon: Music2 },
  { label: 'K-Pop', color: '#148a08', Icon: Sparkles },
  { label: 'Country', color: '#b06239', Icon: Guitar },
  { label: 'Metal', color: '#4f4f4f', Icon: Radio },
];

export function CategoryTiles() {
  const navigate = useNavigate();

  return (
    <div className="category-grid">
      {GENRES.map(({ label, color, Icon }) => (
        <button
          key={label}
          type="button"
          className="category-tile"
          style={{ ['--tile-color' as string]: color }}
          onClick={() => navigate(`/search?q=${encodeURIComponent(label)}`)}
        >
          {label}
          <Icon size={64} strokeWidth={1.25} />
        </button>
      ))}
    </div>
  );
}
