/**
 * TrackCard — individual track item in lists.
 * iOS-style row with thumbnail, info, and action menu.
 */

import { useState, useRef, useEffect } from 'react';
import {
  RiPlayFill,
  RiMoreLine,
  RiPlayListAddLine,
  RiSkipForwardLine,
  RiAddLine,
} from 'react-icons/ri';
import type { Track } from '../../types';
import { usePlayerStore } from '../../stores/playerStore';
import { usePlaylistStore } from '../../stores/playlistStore';
import { formatTime } from '../../utils/format';

interface TrackCardProps {
  track: Track;
  index?: number;
  tracks?: Track[];  // sibling tracks for "play all from here"
  showIndex?: boolean;
}

export function TrackCard({ track, index = 0, tracks, showIndex }: TrackCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { currentTrack, state, playQueue, addToQueue, playNext } = usePlayerStore();
  const { playlists, addTrack } = usePlaylistStore();

  const isCurrentTrack = currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && state === 'playing';

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handlePlay = () => {
    if (tracks && tracks.length > 0) {
      playQueue(tracks, index);
    } else {
      playQueue([track], 0);
    }
  };

  return (
    <div
      className={`track-row group ${isCurrentTrack ? 'track-row-active' : ''}`}
      onClick={handlePlay}
    >
      {/* Index or play icon */}
      {showIndex && (
        <span className="w-7 text-center text-sm text-white/30 group-hover:hidden tabular-nums">
          {isCurrentTrack ? (
            <div className="equalizer mx-auto">
              <div className="equalizer-bar" />
              <div className="equalizer-bar" />
              <div className="equalizer-bar" />
            </div>
          ) : (
            index + 1
          )}
        </span>
      )}

      {/* Thumbnail */}
      <div className="relative flex-shrink-0">
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-14 h-14 rounded-xl object-cover"
          loading="lazy"
        />
        {/* Play overlay on hover */}
        <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 
          transition-opacity duration-200 flex items-center justify-center">
          <RiPlayFill size={20} className="text-white" />
        </div>
        {/* Playing indicator */}
        {isPlaying && !showIndex && (
          <div className="absolute bottom-0.5 right-0.5">
            <div className="equalizer scale-75">
              <div className="equalizer-bar" />
              <div className="equalizer-bar" />
              <div className="equalizer-bar" />
            </div>
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium line-clamp-1 ${isCurrentTrack ? 'text-brand-400' : 'text-white'}`}>
          {track.title}
        </p>
        <p className="text-xs text-white/45 line-clamp-1 mt-0.5">
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span className="text-xs text-white/30 tabular-nums hidden sm:block">
        {track.duration > 0 ? formatTime(track.duration) : ''}
      </span>

      {/* More button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="btn-ghost p-2 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="More options"
        >
          <RiMoreLine size={18} />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute right-0 top-full mt-1 w-52 glass rounded-2xl py-1.5 z-50 
            shadow-2xl shadow-black/50 animate-scale-in">
            <button
              onClick={(e) => {
                e.stopPropagation();
                playNext(track);
                setShowMenu(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] transition-colors"
            >
              <RiSkipForwardLine size={16} />
              Play Next
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addToQueue(track);
                setShowMenu(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] transition-colors"
            >
              <RiPlayListAddLine size={16} />
              Add to Queue
            </button>
            <div className="border-t border-white/[0.06] my-1" />
            {playlists.length > 0 ? (
              playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    addTrack(pl.id, track);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] transition-colors"
                >
                  <RiAddLine size={16} />
                  {pl.name}
                </button>
              ))
            ) : (
              <p className="px-4 py-2 text-xs text-white/30">No playlists yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
