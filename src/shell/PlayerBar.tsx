import {
  Heart,
  ListMusic,
  Loader2,
  Maximize2,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { usePlayerStore } from '@/state/player';
import { useLibraryStore } from '@/state/library';
import { useUIStore } from '@/state/ui';
import { useScrubber } from '@/hooks/useScrubber';
import { formatTime } from '@/lib/format';
import { Artwork } from '@/components/common/Artwork';
import { VolumeControl } from './VolumeControl';

export function PlayerBar() {
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
  const togglePanel = useUIStore((s) => s.togglePanel);
  const openFullScreen = useUIStore((s) => s.openFullScreen);
  const liked = useLibraryStore((s) => (track ? s.liked.some((t) => t.id === track.id) : false));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  const max = Math.max(duration || 0, 1);
  const scrubber = useScrubber(progress, seek);

  if (!track) return null;

  const playing = state === 'playing';
  const loading = state === 'loading';

  return (
    <div className="player-dock">
      <div className="player-pill relative" role="region" aria-label="Player">
        <button type="button" className="player-track" onClick={openFullScreen}>
          <span className="player-track-art">
            <Artwork src={track.thumbnail} alt="" size={96} />
          </span>
          <span className="player-track-meta">
            <span className="player-track-title">{track.title}</span>
            <span className="player-track-artist">{track.artist}</span>
          </span>
        </button>

        <div className="player-center">
          <button
            type="button"
            className="player-btn"
            onClick={toggleShuffle}
            aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
            aria-pressed={shuffle}
            style={shuffle ? { color: 'var(--keyColor)' } : undefined}
          >
            <Shuffle size={15} />
          </button>
          <button type="button" className="player-btn" onClick={previous} aria-label="Previous">
            <SkipBack size={17} fill="currentColor" strokeWidth={0} />
          </button>
          <button
            type="button"
            className="player-btn play"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {loading ? (
              <Loader2 size={19} className="animate-spin" />
            ) : playing ? (
              <Pause size={19} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={19} fill="currentColor" strokeWidth={0} />
            )}
          </button>
          <button type="button" className="player-btn" onClick={() => next()} aria-label="Next">
            <SkipForward size={17} fill="currentColor" strokeWidth={0} />
          </button>
          <button
            type="button"
            className="player-btn"
            onClick={cycleRepeat}
            aria-label={`Repeat ${repeat}`}
            aria-pressed={repeat !== 'off'}
            style={repeat !== 'off' ? { color: 'var(--keyColor)' } : undefined}
          >
            {repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
          </button>
        </div>

        <div className="player-scrub">
          <span className="player-time">{formatTime(scrubber.value)}</span>
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
          <span className="player-time">{formatTime(duration)}</span>
        </div>

        <div className="player-right hide-mobile">
          <button
            type="button"
            className="player-btn"
            onClick={() => toggleLike(track)}
            aria-label={liked ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={liked}
            style={liked ? { color: 'var(--keyColor)' } : undefined}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          </button>
          <VolumeControl />
          <div className="player-divider" />
          <button
            type="button"
            className="player-btn"
            onClick={() => togglePanel('lyrics')}
            aria-label="Lyrics"
          >
            <Mic2 size={16} />
          </button>
          <button
            type="button"
            className="player-btn"
            onClick={() => togglePanel('queue')}
            aria-label="Up next"
          >
            <ListMusic size={16} />
          </button>
          <button
            type="button"
            className="player-btn"
            onClick={openFullScreen}
            aria-label="Full-screen player"
          >
            <Maximize2 size={15} />
          </button>
        </div>

        <div className="player-mobile-controls show-mobile">
          <button
            type="button"
            className="player-btn play"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : playing ? (
              <Pause size={18} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={18} fill="currentColor" strokeWidth={0} />
            )}
          </button>
          <button type="button" className="player-btn" onClick={() => next()} aria-label="Next">
            <SkipForward size={17} fill="currentColor" strokeWidth={0} />
          </button>
        </div>

        <div className="player-mobile-scrub">
          <span style={{ width: `${Math.min(100, (progress / max) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
