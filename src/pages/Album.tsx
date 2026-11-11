import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Disc3, Play, Shuffle } from 'lucide-react';
import { albumQuery } from '@/data/music/queries';
import { DetailHeader } from '@/components/music/DetailHeader';
import { TrackList } from '@/components/music/TrackList';
import { DetailSkeleton } from '@/components/common/Skeletons';
import { ErrorState } from '@/components/common/States';
import { formatLongTime } from '@/lib/format';
import { usePlayerStore } from '@/state/player';
import { useLibraryStore } from '@/state/library';

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function AlbumPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useQuery(albumQuery(id));
  const playQueue = usePlayerStore((s) => s.playQueue);
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !data) {
    return (
      <div className="page">
        <ErrorState
          message={error instanceof Error ? error.message : 'This album could not be loaded.'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const total = data.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  const play = (random: boolean) => {
    const tracks = random ? shuffled(data.tracks) : data.tracks;
    playQueue(tracks, 0, data.title);
  };

  return (
    <div className="page">
      <DetailHeader
        kind="Album"
        title={data.title}
        artwork={data.artwork}
        subtitle={
          data.artistId ? (
            <Link to={`/artist/${encodeURIComponent(data.artistId)}`}>{data.artist}</Link>
          ) : (
            data.artist
          )
        }
        meta={
          <>
            {data.year && <span>{data.year}</span>}
            {data.year && <span aria-hidden="true">·</span>}
            <span>
              {data.trackCount || data.tracks.length} song
              {(data.trackCount || data.tracks.length) === 1 ? '' : 's'}
            </span>
            {total > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatLongTime(total)}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <button type="button" className="primary-btn" onClick={() => play(false)}>
              <Play size={14} fill="currentColor" strokeWidth={0} /> Play
            </button>
            <button type="button" className="secondary-btn" onClick={() => play(true)}>
              <Shuffle size={14} /> Shuffle
            </button>
            <button
              type="button"
              className="icon-btn lg"
              aria-label="Add album to favourites"
              onClick={() => {
                const first = data.tracks[0];
                if (first) toggleLike(first);
              }}
            >
              <Disc3 size={17} />
            </button>
          </>
        }
      />
      <TrackList tracks={data.tracks} label={data.title} showArtwork={false} />
      {data.description && (
        <p className="t-callout t-secondary mt-8 max-w-[640px] whitespace-pre-line">{data.description}</p>
      )}
    </div>
  );
}
