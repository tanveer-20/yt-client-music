import { Heart, Pause, Play } from 'lucide-react';
import type { Track } from '@/types';
import { usePlayerStore } from '@/state/player';
import { useLibraryStore } from '@/state/library';
import { formatTime } from '@/lib/format';
import { Artwork } from '@/components/common/Artwork';
import { TrackMenu } from './TrackMenu';

interface TrackListProps {
  tracks: Track[];
  label?: string;
  showArtwork?: boolean;
  showAlbum?: boolean;
  className?: string;
}

interface TrackRowProps {
  track: Track;
  index: number;
  tracks: Track[];
  label: string;
  showArtwork: boolean;
  showAlbum: boolean;
}

function TrackRow({ track, index, tracks, label, showArtwork, showAlbum }: TrackRowProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackState = usePlayerStore((s) => s.state);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const liked = useLibraryStore((s) => s.liked.some((t) => t.id === track.id));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  const active = currentTrack?.id === track.id;
  const playing = active && playbackState === 'playing';

  const play = () => {
    if (active) togglePlay();
    else playQueue(tracks, index, label);
  };

  return (
    <div
      className="track-row"
      data-active={active}
      role="button"
      tabIndex={0}
      aria-label={`Play ${track.title} by ${track.artist}`}
      onClick={play}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          play();
        }
      }}
    >
      <span className="track-index" aria-hidden="true">
        {active ? (
          playing ? (
            <Pause size={12} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={12} fill="currentColor" strokeWidth={0} />
          )
        ) : (
          index + 1
        )}
      </span>

      {showArtwork && (
        <span className="track-art">
          <Artwork src={track.thumbnail} alt="" size={96} />
        </span>
      )}

      <span className="track-main">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">
          {track.artist}
          {showAlbum && track.album ? ` — ${track.album}` : ''}
        </span>
      </span>

      <span className="track-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="icon-btn"
          aria-label={liked ? `Remove ${track.title} from favourites` : `Add ${track.title} to favourites`}
          aria-pressed={liked}
          onClick={() => toggleLike(track)}
        >
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <TrackMenu track={track} />
      </span>

      <span className="track-duration">{formatTime(track.duration)}</span>
    </div>
  );
}

export function TrackList({
  tracks,
  label = '',
  showArtwork = true,
  showAlbum = false,
  className = '',
}: TrackListProps) {
  if (!tracks.length) return null;

  return (
    <div className={`tracklist ${className}`} role="list">
      {tracks.map((track, index) => (
        <div role="listitem" key={`${track.id}:${index}`}>
          <TrackRow
            track={track}
            index={index}
            tracks={tracks}
            label={label}
            showArtwork={showArtwork}
            showAlbum={showAlbum}
          />
        </div>
      ))}
    </div>
  );
}
