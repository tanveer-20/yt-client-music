/**
 * QueuePanel — sliding panel showing current queue.
 */

import { RiCloseLine, RiDeleteBinLine, RiMusic2Line } from 'react-icons/ri';
import { usePlayerStore } from '../../stores/playerStore';
import { useUIStore } from '../../stores/uiStore';
import { formatTime } from '../../utils/format';

export function QueuePanel() {
  const { isQueueOpen, setQueueOpen } = useUIStore();
  const { queue, queueIndex, currentTrack, clearQueue, removeFromQueue, playQueue } =
    usePlayerStore();

  if (!isQueueOpen) return null;

  const upNext = queue.slice(queueIndex + 1);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-60 animate-fade-in"
        onClick={() => setQueueOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm z-60 glass border-l border-white/[0.08] shadow-2xl flex flex-col animate-slide-up md:animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-bold">Queue</h2>
          <div className="flex items-center gap-1">
            {queue.length > 1 && (
              <button
                onClick={clearQueue}
                className="btn-ghost text-white/40 hover:text-white"
                aria-label="Clear queue"
              >
                <RiDeleteBinLine size={18} />
              </button>
            )}
            <button
              onClick={() => setQueueOpen(false)}
              className="btn-ghost"
              aria-label="Close queue"
            >
              <RiCloseLine size={22} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Now Playing */}
          {currentTrack && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                Now Playing
              </p>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.05]">
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-12 h-12 rounded-xl object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-400 line-clamp-1">
                    {currentTrack.title}
                  </p>
                  <p className="text-xs text-white/45 line-clamp-1">
                    {currentTrack.artist}
                  </p>
                </div>
                <div className="equalizer">
                  <div className="equalizer-bar" />
                  <div className="equalizer-bar" />
                  <div className="equalizer-bar" />
                </div>
              </div>
            </div>
          )}

          {/* Up Next */}
          {upNext.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                Up Next · {upNext.length} track{upNext.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-0.5">
                {upNext.map((track, i) => {
                  const absoluteIndex = queueIndex + 1 + i;
                  return (
                    <div
                      key={`${track.id}-${absoluteIndex}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                        hover:bg-white/[0.05] transition-colors cursor-pointer group"
                      onClick={() => playQueue(queue, absoluteIndex)}
                    >
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-10 h-10 rounded-lg object-cover"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white line-clamp-1">{track.title}</p>
                        <p className="text-xs text-white/40 line-clamp-1">{track.artist}</p>
                      </div>
                      <span className="text-xs text-white/25 tabular-nums">
                        {track.duration > 0 ? formatTime(track.duration) : ''}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(absoluteIndex);
                        }}
                        className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove from queue"
                      >
                        <RiCloseLine size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {upNext.length === 0 && !currentTrack && (
            <div className="flex flex-col items-center justify-center py-20">
              <RiMusic2Line size={40} className="text-white/10 mb-3" />
              <p className="text-white/30 text-sm">Queue is empty</p>
              <p className="text-white/20 text-xs mt-1">Search for music to play</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
