import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { MediaItem, Track } from '@/types';
import { usePlayerStore } from '@/state/player';
import { Artwork } from '@/components/common/Artwork';

export function itemTrack(item: MediaItem): Track {
  return {
    id: item.id,
    title: item.title,
    artist: item.subtitle || 'Unknown Artist',
    thumbnail: item.artwork || '',
    duration: item.duration || 0,
  };
}

export function itemPath(item: MediaItem): string {
  switch (item.kind) {
    case 'album':
      return `/album/${encodeURIComponent(item.id)}`;
    case 'artist':
      return `/artist/${encodeURIComponent(item.id)}`;
    case 'playlist':
      return `/playlist/${encodeURIComponent(item.id)}`;
    default:
      return `/search?q=${encodeURIComponent(`${item.title} ${item.subtitle || ''}`.trim())}`;
  }
}

interface LockupProps {
  item: MediaItem;
  eager?: boolean;
}

export function Lockup({ item, eager }: LockupProps) {
  const navigate = useNavigate();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const isPlayable = item.kind === 'track' || item.kind === 'video';

  const open = () => {
    if (isPlayable) playTrack(itemTrack(item), [itemTrack(item)]);
    else navigate(itemPath(item));
  };

  return (
    <button
      type="button"
      className="lockup group"
      onClick={open}
      title={item.title}
    >
      <div className={`lockup-art ${item.round ? 'round' : ''}`}>
        <Artwork src={item.artwork} alt={item.title} size={344} eager={eager} />
        <span
          className="lockup-play"
          aria-hidden="true"
          onClick={(event) => {
            event.stopPropagation();
            open();
          }}
        >
          <Play size={15} fill="currentColor" strokeWidth={0} />
        </span>
      </div>
      <div className="min-w-0">
        <div className="lockup-title">{item.title}</div>
        {item.subtitle && <div className="lockup-subtitle">{item.subtitle}</div>}
      </div>
    </button>
  );
}
