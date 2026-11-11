import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Disc3,
  Heart,
  HeartOff,
  ListMusic,
  ListPlus,
  MoreHorizontal,
  Play,
  UserRound,
} from 'lucide-react';
import type { Track } from '@/types';
import { usePlayerStore } from '@/state/player';
import { useLibraryStore } from '@/state/library';

interface TrackMenuProps {
  track: Track;
  className?: string;
}

interface MenuPos {
  x: number;
  y: number;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 236;

export function TrackMenu({ track, className = '' }: TrackMenuProps) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const playQueue = usePlayerStore((s) => s.playQueue);
  const playNext = usePlayerStore((s) => s.playNext);
  const enqueue = usePlayerStore((s) => s.enqueue);
  const liked = useLibraryStore((s) => s.liked.some((t) => t.id === track.id));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (buttonRef.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  const openMenu = (event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      y:
        rect.bottom + MENU_HEIGHT > window.innerHeight
          ? Math.max(8, rect.top - MENU_HEIGHT - 4)
          : rect.bottom + 4,
    });
  };

  const run = (action: () => void) => {
    setPos(null);
    action();
  };

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[var(--tracklistHoverColor)]';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`icon-btn ${className}`}
        onClick={openMenu}
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(pos)}
      >
        <MoreHorizontal size={17} />
      </button>

      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[9951] rounded-lg border border-[var(--labelDivider)] bg-[var(--pageBG)] p-1 shadow-2xl"
            style={{ top: pos.y, left: pos.x, width: MENU_WIDTH }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => run(() => playQueue([track], 0, track.title))}
            >
              <Play size={15} /> Play now
            </button>
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => run(() => playNext(track))}
            >
              <ListPlus size={15} /> Play next
            </button>
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => run(() => enqueue(track))}
            >
              <ListMusic size={15} /> Add to queue
            </button>
            <div className="my-1 h-px bg-[var(--labelDivider)]" />
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => run(() => toggleLike(track))}
            >
              {liked ? <HeartOff size={15} /> : <Heart size={15} />}
              {liked ? 'Remove from favourites' : 'Add to favourites'}
            </button>
            {track.albumId && (
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => run(() => navigate(`/album/${encodeURIComponent(track.albumId!)}`))}
              >
                <Disc3 size={15} /> Go to album
              </button>
            )}
            {track.artistId && (
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => run(() => navigate(`/artist/${encodeURIComponent(track.artistId!)}`))}
              >
                <UserRound size={15} /> Go to artist
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
