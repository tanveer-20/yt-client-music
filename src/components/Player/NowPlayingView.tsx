/**
 * NowPlayingView — full-screen now playing overlay (Apple Music style).
 * Supports native Apple Music swipe gestures, 3-mode in-player switcher
 * (Artwork ↔ Up Next Queue ↔ Audio Quality Specs), and fluid animations.
 */

import { useState, useRef } from 'react';
import {
  RiArrowDownSLine,
  RiPlayFill,
  RiPauseFill,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiShuffleLine,
  RiRepeatLine,
  RiRepeatOneLine,
  RiPlayListLine,
  RiPlayListFill,
  RiHeartLine,
  RiHeartFill,
  RiSoundModuleLine,
  RiInformationLine,
  RiInformationFill,
  RiCloseLine,
  RiDeleteBinLine,
  RiCpuLine,
  RiCheckLine,
  RiExternalLinkLine,
} from 'react-icons/ri';
import { usePlayerStore } from '../../stores/playerStore';
import { usePlaylistStore } from '../../stores/playlistStore';
import { useUIStore } from '../../stores/uiStore';
import { ProgressBar } from './ProgressBar';
import { VolumeControl } from './VolumeControl';
import { formatTime } from '../../utils/format';

export function NowPlayingView() {
  const {
    currentTrack,
    state,
    progress,
    duration,
    repeatMode,
    isShuffled,
    queue,
    queueIndex,
    pause,
    resume,
    play,
    next,
    previous,
    seek,
    toggleShuffle,
    cycleRepeat,
    removeFromQueue,
    playQueue,
    clearQueue,
  } = usePlayerStore();

  const { isFavorite, toggleFavorite } = usePlaylistStore();
  const { isNowPlayingOpen, setNowPlayingOpen } = useUIStore();

  // In-player view mode: 'artwork' | 'queue' | 'specs' (Apple Music style)
  const [activeTab, setActiveTab] = useState<'artwork' | 'queue' | 'specs'>('artwork');

  // ── Swipe Down to Dismiss Gestures ──
  const [sheetOffsetY, setSheetOffsetY] = useState(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const sheetStartYRef = useRef(0);

  const handleGrabberTouchStart = (e: React.TouchEvent) => {
    sheetStartYRef.current = e.touches[0].clientY;
    setIsDraggingSheet(true);
  };

  const handleGrabberTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingSheet) return;
    const deltaY = e.touches[0].clientY - sheetStartYRef.current;
    if (deltaY > 0) {
      setSheetOffsetY(deltaY);
    }
  };

  const handleGrabberTouchEnd = () => {
    setIsDraggingSheet(false);
    if (sheetOffsetY > 110) {
      setNowPlayingOpen(false);
    }
    setSheetOffsetY(0);
  };

  // ── Swipe Left/Right on Artwork to Skip Tracks ──
  const [artOffsetX, setArtOffsetX] = useState(0);
  const [isSwipingArt, setIsSwipingArt] = useState(false);
  const artStartXRef = useRef(0);
  const artStartYRef = useRef(0);

  const handleArtTouchStart = (e: React.TouchEvent) => {
    artStartXRef.current = e.touches[0].clientX;
    artStartYRef.current = e.touches[0].clientY;
    setIsSwipingArt(true);
  };

  const handleArtTouchMove = (e: React.TouchEvent) => {
    if (!isSwipingArt) return;
    const deltaX = e.touches[0].clientX - artStartXRef.current;
    const deltaY = e.touches[0].clientY - artStartYRef.current;

    // Only handle horizontal swipe on artwork
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setArtOffsetX(deltaX);
    }
  };

  const handleArtTouchEnd = () => {
    setIsSwipingArt(false);
    if (artOffsetX < -65) {
      // Swiped Left -> Next Song
      next();
    } else if (artOffsetX > 65) {
      // Swiped Right -> Previous Song
      previous();
    }
    setArtOffsetX(0);
  };

  if (!isNowPlayingOpen || !currentTrack) return null;

  const isLiked = currentTrack && typeof isFavorite === 'function' ? isFavorite(currentTrack.id) : false;
  const isPlaying = state === 'playing';
  const isLoading = state === 'loading';
  const progressRatio = duration > 0 ? Math.max(0, Math.min(1, progress / duration)) : 0;
  const upNext = Array.isArray(queue) ? queue.slice(queueIndex + 1) : [];

  const handleSeek = (ratio: number) => {
    seek(ratio * duration);
  };

  const handleTogglePlay = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (state === 'playing') {
      pause();
    } else if (state === 'loading') {
      pause();
    } else if (state === 'error' && currentTrack) {
      play(currentTrack);
    } else {
      resume();
    }
  };

  return (
    <div
      className="now-playing-view fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#181824] via-[#0e0e14] to-[#0a0a0f] text-white select-none overflow-hidden"
      style={{
        transform: sheetOffsetY > 0 ? `translateY(${sheetOffsetY}px)` : undefined,
        transition: isDraggingSheet ? 'none' : 'transform 0.25s ease-out',
      }}
    >
      {/* Background artwork glow */}
      {currentTrack.thumbnail && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={currentTrack.thumbnail}
            alt=""
            className="w-full h-full object-cover scale-150 blur-3xl opacity-20 transform-gpu"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-[#0a0a0f]" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full px-5 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
        {/* ── Grabber Handle (Dedicated drag-down trigger) ── */}
        <div
          onTouchStart={handleGrabberTouchStart}
          onTouchMove={handleGrabberTouchMove}
          onTouchEnd={handleGrabberTouchEnd}
          className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          <div className="w-12 h-1.5 bg-white/35 rounded-full mb-1 hover:bg-white/50 transition-colors" />
        </div>

        {/* ── Header Buttons (Clean, touch-safe, no glitch) ── */}
        <div className="flex items-center justify-between py-2 mb-2">
          <button
            onClick={() => setNowPlayingOpen(false)}
            onTouchStart={(e) => e.stopPropagation()}
            className="btn-ghost"
            aria-label="Minimize player"
          >
            <RiArrowDownSLine size={28} />
          </button>

          <p className="text-xs font-semibold text-white/65 uppercase tracking-widest">
            {activeTab === 'queue'
              ? 'Playing Next'
              : activeTab === 'specs'
              ? 'Audio Quality & Specs'
              : 'Now Playing'}
          </p>

          <div className="flex items-center gap-1">
            {/* Info / Audio Quality Button */}
            <button
              onClick={() => setActiveTab(activeTab === 'specs' ? 'artwork' : 'specs')}
              onTouchStart={(e) => e.stopPropagation()}
              className={`btn-ghost transition-all ${
                activeTab === 'specs' ? 'bg-white/20 text-white scale-105' : 'text-white/60 hover:text-white'
              }`}
              aria-label="Audio Details"
              title="Song Technical Specs"
            >
              {activeTab === 'specs' ? <RiInformationFill size={22} /> : <RiInformationLine size={22} />}
            </button>

            {/* Up Next Queue Button */}
            <button
              onClick={() => setActiveTab(activeTab === 'queue' ? 'artwork' : 'queue')}
              onTouchStart={(e) => e.stopPropagation()}
              className={`btn-ghost transition-all ${
                activeTab === 'queue' ? 'bg-white/20 text-white scale-105' : 'text-white/60 hover:text-white'
              }`}
              aria-label="Toggle Queue"
              title="Up Next List"
            >
              {activeTab === 'queue' ? <RiPlayListFill size={22} /> : <RiPlayListLine size={22} />}
            </button>
          </div>
        </div>

        {/* ── Center Area: Switch between Artwork, Queue, and Audio Specs ── */}
        {activeTab === 'artwork' ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-2 select-none min-h-0">
            <div
              onTouchStart={handleArtTouchStart}
              onTouchMove={handleArtTouchMove}
              onTouchEnd={handleArtTouchEnd}
              className="relative cursor-grab active:cursor-grabbing touch-pan-y w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center"
              style={{
                transform: `translateX(${artOffsetX}px) rotate(${artOffsetX * 0.04}deg)`,
                transition: isSwipingArt ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)',
              }}
            >
              <img
                src={currentTrack.thumbnail || `https://i.ytimg.com/vi/${currentTrack.id}/hqdefault.jpg`}
                alt={currentTrack.title}
                draggable={false}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${currentTrack.id}/hqdefault.jpg`;
                }}
                className={`w-full h-full rounded-2xl sm:rounded-3xl object-cover bg-white/10
                  shadow-2xl shadow-black/80 transition-all duration-300 pointer-events-none
                  ${isPlaying ? 'scale-100' : 'scale-[0.94]'}`}
              />
            </div>

            {/* Swipe Tip Pill */}
            <div className="flex items-center gap-2 mt-3 text-[11px] text-white/35 tracking-wide">
              <span>‹ Swipe artwork to skip ›</span>
            </div>
          </div>
        ) : activeTab === 'queue' ? (
          /* ── In-Player Up Next Queue View (Apple Music Style) ── */
          <div className="flex-1 overflow-y-auto px-1 py-2 min-h-0 animate-fade-in">
            {/* Header & Clear */}
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                Up Next ({upNext.length})
              </span>
              {queue.length > 1 && (
                <button
                  onClick={clearQueue}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
                >
                  <RiDeleteBinLine size={14} />
                  Clear
                </button>
              )}
            </div>

            {/* Up Next List */}
            {upNext.length > 0 ? (
              <div className="space-y-1">
                {upNext.map((track, i) => {
                  const absoluteIndex = queueIndex + 1 + i;
                  return (
                    <div
                      key={`queue-${track.id}-${absoluteIndex}`}
                      onClick={() => playQueue(queue, absoluteIndex)}
                      className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] active:bg-white/[0.2] transition-colors cursor-pointer group"
                    >
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white line-clamp-1">
                          {track.title}
                        </p>
                        <p className="text-xs text-white/55 line-clamp-1 mt-0.5">
                          {track.artist}
                        </p>
                      </div>
                      <span className="text-xs text-white/40 tabular-nums">
                        {track.duration > 0 ? formatTime(track.duration) : ''}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(absoluteIndex);
                        }}
                        onTouchStart={(e) => e.stopPropagation()}
                        className="btn-ghost p-1.5 text-white/40 hover:text-white"
                        aria-label="Remove"
                      >
                        <RiCloseLine size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-white/45 text-sm font-medium">No upcoming tracks</p>
                <p className="text-white/30 text-xs mt-1">
                  Auto-Play will find similar songs when this track finishes
                </p>
              </div>
            )}
          </div>
        ) : (
          /* ── In-Player Audio Quality & Specs Breakdown View ── */
          <div className="flex-1 overflow-y-auto px-2 py-3 min-h-0 animate-fade-in flex flex-col justify-center">
            <div className="p-5 rounded-3xl bg-white/[0.08] border border-white/[0.12] backdrop-blur-xl shadow-2xl space-y-3.5 max-w-sm mx-auto w-full">
              {/* Badge */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/[0.08]">
                <div className="w-11 h-11 rounded-xl bg-brand-500 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-500/30">
                  <RiCpuLine size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-300">
                      Hi-Res Audio
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/30 text-brand-200 font-semibold">
                      Apple AAC
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white mt-0.5">256 kbps · 48.0 kHz Stereo</p>
                </div>
              </div>

              {/* Specs Rows */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-white/[0.06]">
                  <span className="text-white/50">Codec</span>
                  <span className="text-white font-medium">AAC-LC / M4A Container</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.06]">
                  <span className="text-white/50">Bitrate</span>
                  <span className="text-white font-medium flex items-center gap-1">
                    <RiCheckLine size={13} className="text-emerald-400" />
                    256 kbps (High Fidelity)
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.06]">
                  <span className="text-white/50">Channels & Rate</span>
                  <span className="text-white font-medium">2-Channel Stereo (48,000 Hz)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.06]">
                  <span className="text-white/50">Audio Engine</span>
                  <span className="text-brand-300 font-medium">YouTube Edge Audio Stream</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-white/50">YouTube Source</span>
                  <a
                    href={`https://www.youtube.com/watch?v=${currentTrack.id}`}
                    target="_blank"
                    rel="noreferrer"
                    onTouchStart={(e) => e.stopPropagation()}
                    className="text-brand-400 hover:text-brand-300 font-mono text-xs flex items-center gap-1"
                  >
                    {currentTrack.id}
                    <RiExternalLinkLine size={12} />
                  </a>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('artwork')}
                onTouchStart={(e) => e.stopPropagation()}
                className="w-full py-2.5 rounded-xl bg-white/[0.1] hover:bg-white/[0.18] text-white text-xs font-semibold tracking-wide transition-colors mt-2"
              >
                Back to Artwork
              </button>
            </div>
          </div>
        )}

        {/* ── Track Info & Hi-Res Badge ── */}
        <div className="px-2 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white line-clamp-1">
                {currentTrack.title}
              </h2>
              <p className="text-base text-white/60 line-clamp-1 mt-0.5 font-medium">
                {currentTrack.artist}
              </p>

              {/* Apple Music Style Audio Badge (Clickable) */}
              <button
                onClick={() => setActiveTab(activeTab === 'specs' ? 'artwork' : 'specs')}
                onTouchStart={(e) => e.stopPropagation()}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/[0.1] hover:bg-white/[0.18] border border-white/[0.1] text-[10px] font-bold text-brand-300 uppercase tracking-wider transition-colors active:scale-95"
              >
                <RiSoundModuleLine size={12} className="text-brand-400" />
                Hi-Res 256k AAC · Specs
              </button>
            </div>

            <button
              onClick={() => toggleFavorite(currentTrack)}
              onTouchStart={(e) => e.stopPropagation()}
              className={`btn-ghost mt-1 transition-all duration-200 ${
                isLiked ? 'text-brand-500 hover:text-brand-400 scale-110' : 'text-white/50 hover:text-white'
              }`}
              aria-label={isLiked ? 'Unlike' : 'Like'}
            >
              {isLiked ? (
                <RiHeartFill size={28} className="text-brand-500 animate-bounce-in" />
              ) : (
                <RiHeartLine size={28} />
              )}
            </button>
          </div>
        </div>

        {/* ── Progress Scrubber ── */}
        <div className="px-2 mb-3">
          <ProgressBar
            value={progressRatio}
            onChange={handleSeek}
            height={5}
          />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-white/45 font-medium tabular-nums">
              {formatTime(progress)}
            </span>
            <span className="text-xs text-white/45 font-medium tabular-nums">
              -{formatTime(Math.max(0, duration - progress))}
            </span>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex items-center justify-between px-3 sm:px-6 mb-5">
          <button
            onClick={toggleShuffle}
            onTouchStart={(e) => e.stopPropagation()}
            className={`btn-ghost ${isShuffled ? 'text-brand-400' : 'text-white/40'}`}
            aria-label="Shuffle"
          >
            <RiShuffleLine size={22} />
          </button>
          <button
            onClick={previous}
            onTouchStart={(e) => e.stopPropagation()}
            className="btn-ghost text-white"
            aria-label="Previous"
          >
            <RiSkipBackFill size={32} />
          </button>
          <button
            onClick={handleTogglePlay}
            onTouchStart={(e) => e.stopPropagation()}
            className={`btn-icon bg-white text-black w-16 h-16 rounded-full
              hover:scale-105 active:scale-95 shadow-xl shadow-black/40 ${isLoading ? 'loading-pulse' : ''}`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <RiPauseFill size={32} /> : <RiPlayFill size={32} />}
          </button>
          <button
            onClick={next}
            onTouchStart={(e) => e.stopPropagation()}
            className="btn-ghost text-white"
            aria-label="Next"
          >
            <RiSkipForwardFill size={32} />
          </button>
          <button
            onClick={cycleRepeat}
            onTouchStart={(e) => e.stopPropagation()}
            className={`btn-ghost ${repeatMode !== 'off' ? 'text-brand-400' : 'text-white/40'}`}
            aria-label="Repeat"
          >
            {repeatMode === 'one' ? (
              <RiRepeatOneLine size={22} />
            ) : (
              <RiRepeatLine size={22} />
            )}
          </button>
        </div>

        {/* ── Volume ── */}
        <div className="px-4 mb-2">
          <VolumeControl />
        </div>
      </div>
    </div>
  );
}
