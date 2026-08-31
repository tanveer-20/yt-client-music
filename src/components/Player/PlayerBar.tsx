/**
 * PlayerBar — iOS-style mini player fixed at the bottom.
 * Shows track info, controls, progress, and volume.
 * Tapping the track info area opens the full NowPlayingView.
 */

import {
  RiPlayFill,
  RiPauseFill,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiShuffleLine,
  RiRepeatLine,
  RiRepeatOneLine,
  RiPlayListLine,
} from 'react-icons/ri';
import { usePlayerStore } from '../../stores/playerStore';
import { useUIStore } from '../../stores/uiStore';
import { ProgressBar } from './ProgressBar';
import { VolumeControl } from './VolumeControl';
import { formatTime } from '../../utils/format';

export function PlayerBar() {
  const {
    currentTrack,
    state,
    progress,
    duration,
    repeatMode,
    isShuffled,
    pause,
    resume,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore();

  const { toggleQueue, toggleNowPlaying } = useUIStore();

  const isPlaying = state === 'playing';
  const isLoading = state === 'loading';
  const progressRatio = duration > 0 ? progress / duration : 0;

  const handleSeek = (ratio: number) => {
    seek(ratio * duration);
  };

  if (!currentTrack) {
    return (
      <div className="glass border-t border-white/[0.06] px-4 py-3 flex items-center justify-center">
        <p className="text-white/30 text-sm">No track playing</p>
      </div>
    );
  }

  return (
    <div className="glass border-t border-white/[0.06] relative">
      {/* Sleek top progress indicator on mobile (non-blocking, no overlap) */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-white/[0.08] overflow-hidden md:hidden pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-rose-400 transition-all duration-100 ease-linear"
          style={{ width: `${progressRatio * 100}%` }}
        />
      </div>

      <div className="px-4 py-2 md:py-3 flex items-center gap-3 md:gap-4">
        {/* ── Track Info (clickable to expand) ── */}
        <button
          onClick={toggleNowPlaying}
          className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] spring-fast"
        >
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-11 h-11 md:w-12 md:h-12 rounded-xl object-cover shadow-lg flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white line-clamp-1">
              {currentTrack.title}
            </p>
            <p className="text-xs text-white/50 line-clamp-1">
              {currentTrack.artist}
            </p>
          </div>
        </button>

        {/* ── Mobile Controls (compact) ── */}
        <div className="flex items-center gap-1 md:hidden">
          <button onClick={previous} className="btn-ghost p-2">
            <RiSkipBackFill size={20} />
          </button>
          <button
            onClick={isPlaying ? pause : resume}
            className={`btn-icon bg-white text-black rounded-full ${isLoading ? 'loading-pulse' : ''}`}
          >
            {isPlaying ? <RiPauseFill size={22} /> : <RiPlayFill size={22} />}
          </button>
          <button onClick={next} className="btn-ghost p-2">
            <RiSkipForwardFill size={20} />
          </button>
        </div>

        {/* ── Desktop Controls (full) ── */}
        <div className="hidden md:flex flex-col items-center gap-1 flex-1 max-w-lg">
          {/* Control buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleShuffle}
              className={`btn-ghost ${isShuffled ? 'text-brand-400' : ''}`}
              aria-label="Shuffle"
            >
              <RiShuffleLine size={18} />
            </button>
            <button onClick={previous} className="btn-ghost" aria-label="Previous">
              <RiSkipBackFill size={20} />
            </button>
            <button
              onClick={isPlaying ? pause : resume}
              className={`btn-icon bg-white text-black rounded-full hover:scale-105 
                ${isLoading ? 'loading-pulse' : ''}`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <RiPauseFill size={24} /> : <RiPlayFill size={24} />}
            </button>
            <button onClick={next} className="btn-ghost" aria-label="Next">
              <RiSkipForwardFill size={20} />
            </button>
            <button
              onClick={cycleRepeat}
              className={`btn-ghost ${repeatMode !== 'off' ? 'text-brand-400' : ''}`}
              aria-label="Repeat"
            >
              {repeatMode === 'one' ? (
                <RiRepeatOneLine size={18} />
              ) : (
                <RiRepeatLine size={18} />
              )}
            </button>
          </div>

          {/* Progress bar + times */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[11px] text-white/40 w-10 text-right tabular-nums">
              {formatTime(progress)}
            </span>
            <ProgressBar
              value={progressRatio}
              onChange={handleSeek}
              className="flex-1"
              height={3}
            />
            <span className="text-[11px] text-white/40 w-10 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* ── Right section ── */}
        <div className="hidden md:flex items-center gap-2">
          <VolumeControl />
          <button
            onClick={toggleQueue}
            className="btn-ghost"
            aria-label="Queue"
          >
            <RiPlayListLine size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
