import { useRef } from 'react';
import { ArrowDown, ArrowUp, ListMusic, Play, Trash2, X } from 'lucide-react';
import { usePlayerStore } from '@/state/player';
import { useUIStore } from '@/state/ui';
import { Artwork } from '@/components/common/Artwork';
import { formatTime } from '@/lib/format';
import { EmptyState } from '@/components/common/States';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export function UpNext() {
  const panel = useUIStore((s) => s.panel);
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panel === 'queue', panelRef);

  const closePanel = useUIStore((s) => s.closePanel);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const contextLabel = usePlayerStore((s) => s.contextLabel);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const removeAt = usePlayerStore((s) => s.removeAt);
  const moveItem = usePlayerStore((s) => s.moveItem);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  if (panel !== 'queue') return null;

  return (
    <aside ref={panelRef} className="side-panel" role="dialog" aria-modal="true" aria-label="Up next">
      <div className="panel-head">
        <div>
          <div className="panel-title">Up Next</div>
          <div className="t-footnote t-secondary truncate" style={{ maxWidth: 200 }}>
            {contextLabel || 'Queue'}
          </div>
        </div>
        <div className="row gap-1">
          {queue.length > 0 && (
            <button type="button" className="icon-btn" onClick={clearQueue} aria-label="Clear queue">
              <Trash2 size={16} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={closePanel} aria-label="Close up next" data-autofocus>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="panel-scroll scroll-area">
        {queue.length === 0 ? (
          <EmptyState icon={<ListMusic size={28} />} title="The queue is empty" description="Play an album or a song to start listening." />
        ) : (
          <div className="flex flex-col gap-0.5">
            {queue.map((track, index) => {
              const active = index === queueIndex;
              return (
                <div
                  key={`${track.id}:${index}`}
                  className="track-row group"
                  data-active={active}
                  role="button"
                  tabIndex={0}
                  onClick={() => playQueue(queue, index, contextLabel)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') playQueue(queue, index, contextLabel);
                  }}
                  style={{ minHeight: 48 }}
                >
                  <span className="track-art" style={{ width: 38, height: 38, flexBasis: 38 }}>
                    <Artwork src={track.thumbnail} alt="" size={96} />
                  </span>
                  <span className="track-main">
                    <span className="track-title">{track.title}</span>
                    <span className="track-artist">{track.artist}</span>
                  </span>
                  <span className="track-duration">{formatTime(track.duration)}</span>
                  <span className="track-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => moveItem(index, index - 1)}
                      disabled={index === 0}
                      aria-label="Move up"
                      style={{ opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => moveItem(index, index + 1)}
                      disabled={index === queue.length - 1}
                      aria-label="Move down"
                      style={{ opacity: index === queue.length - 1 ? 0.3 : 1 }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeAt(index)}
                      aria-label={`Remove ${track.title}`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="px-4 pb-4 pt-1 t-footnote t-tertiary row gap-1">
          <Play size={12} fill="currentColor" strokeWidth={0} />
          {queue.length} track{queue.length === 1 ? '' : 's'}
        </div>
      )}
    </aside>
  );
}
