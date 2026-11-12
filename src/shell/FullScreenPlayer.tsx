import { useRef } from 'react';
import { ChevronDown, Heart, ListMusic, Loader2, Mic2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '@/state/player';
import { useLibraryStore } from '@/state/library';
import { useUIStore } from '@/state/ui';
import { useScrubber } from '@/hooks/useScrubber';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useArtworkTint } from '@/lib/tint';
import { formatTime } from '@/lib/format';
import { Artwork } from '@/components/common/Artwork';
import { VolumeControl } from './VolumeControl';

export function FullScreenPlayer() {
  const open = useUIStore((s) => s.fullScreenOpen);
  const close = useUIStore((s) => s.closeFullScreen);
  const setPanel = useUIStore((s) => s.setPanel);
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, rootRef);

  const track = usePlayerStore((s) => s.currentTrack);
  const state = usePlayerStore((s) => s.state);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const seek = usePlayerStore((s) => s.seek);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const liked = useLibraryStore((s) => (track ? s.liked.some((t) => t.id === track.id) : false));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const tint = useArtworkTint(track?.thumbnail);

  const max = Math.max(duration || 0, 1);
  const scrubber = useScrubber(progress, seek);

  if (!open || !track) return null;

  const playing = state === 'playing';
  const loading = state === 'loading';
  const gradient = tint.color
    ? `radial-gradient(circle at 22% 18%, ${tint.color}b3, transparent 55%), radial-gradient(circle at 82% 78%, ${tint.color}59, transparent 60%), #0c0c0d`
    : 'radial-gradient(circle at 25% 20%, #3a3a3c, #0c0c0d 65%)';

  return (
    <div
      ref={rootRef}
      className="fullscreen"
      data-full-screen
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      style={{ ['--mesh-background' as string]: gradient }}
    >
      <div className="fullscreen-top">
        <button type="button" className="icon-btn" onClick={close} aria-label="Close player" style={{ color: 'inherit' }} data-autofocus>
          <ChevronDown size={22} />
        </button>
        <div className="t-caption uppercase tracking-[0.14em] opacity-60">Now playing</div>
        <div className="row gap-1">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPanel('lyrics')}
            aria-label="Lyrics"
            style={{ color: 'inherit' }}
          >
            <Mic2 size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPanel('queue')}
            aria-label="Up next"
            style={{ color: 'inherit' }}
          >
            <ListMusic size={18} />
          </button>
        </div>
      </div>

      <div className="fullscreen-body">
        <div className="fs-art">
          <Artwork src={track.thumbnail} alt={track.album || track.title} size={1024} eager />
        </div>

        <div className="fs-side">
          <div>
            <div className="fs-title">{track.title}</div>
            <div className="fs-artist">
              {track.artistId ? (
                <Link to={`/artist/${encodeURIComponent(track.artistId)}`} onClick={close}>
                  {track.artist}
                </Link>
              ) : (
                track.artist
              )}
            </div>
            {track.album && (
              <div className="t-callout mt-2 opacity-60">
                {track.albumId ? (
                  <Link to={`/album/${encodeURIComponent(track.albumId)}`} onClick={close}>
                    {track.album}
                  </Link>
                ) : (
                  track.album
                )}
              </div>
            )}
          </div>

          <div>
            <input
              type="range"
              className="slider"
              min={0}
              max={max}
              step={0.1}
              value={Math.min(scrubber.value, max)}
              aria-label="Seek"
              style={{ ['--fill' as string]: `${Math.min(100, (scrubber.value / max) * 100)}%` }}
              onPointerDown={scrubber.start}
              onChange={(event) => scrubber.change(Number(event.target.value))}
              onPointerUp={(event) => scrubber.end(Number(event.currentTarget.value))}
              onKeyUp={(event) => scrubber.end(Number(event.currentTarget.value))}
            />
            <div className="row justify-between t-caption opacity-60 -mt-1">
              <span>{formatTime(scrubber.value)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="row justify-between">
            <button
              type="button"
              className="player-btn"
              onClick={toggleShuffle}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              style={{ color: shuffle ? 'var(--keyColor)' : 'inherit' }}
            >
              <Shuffle size={17} />
            </button>
            <button type="button" className="player-btn" onClick={previous} aria-label="Previous">
              <SkipBack size={24} fill="currentColor" strokeWidth={0} />
            </button>
            <button type="button" className="player-btn play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {loading ? (
                <Loader2 size={28} className="animate-spin" />
              ) : playing ? (
                <Pause size={28} fill="currentColor" strokeWidth={0} />
              ) : (
                <Play size={28} fill="currentColor" strokeWidth={0} />
              )}
            </button>
            <button type="button" className="player-btn" onClick={() => next()} aria-label="Next">
              <SkipForward size={24} fill="currentColor" strokeWidth={0} />
            </button>
            <button
              type="button"
              className="player-btn"
              onClick={cycleRepeat}
              aria-label={`Repeat ${repeat}`}
              aria-pressed={repeat !== 'off'}
              style={{ color: repeat !== 'off' ? 'var(--keyColor)' : 'inherit' }}
            >
              {repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}
            </button>
          </div>

          <div className="row justify-between">
            <button
              type="button"
              className="player-btn"
              onClick={() => toggleLike(track)}
              aria-label={liked ? 'Remove from favourites' : 'Add to favourites'}
              style={{ color: liked ? 'var(--keyColor)' : 'inherit' }}
            >
              <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
            </button>
            <VolumeControl />
          </div>
        </div>
      </div>
    </div>
  );
}
