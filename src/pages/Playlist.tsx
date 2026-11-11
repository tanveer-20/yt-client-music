import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ListMusic, Play, Shuffle } from 'lucide-react';
import { playlistQuery } from '@/data/music/queries';
import { DetailHeader } from '@/components/music/DetailHeader';
import { TrackList } from '@/components/music/TrackList';
import { DetailSkeleton } from '@/components/common/Skeletons';
import { ErrorState } from '@/components/common/States';
import { formatLongTime } from '@/lib/format';
import { usePlayerStore } from '@/state/player';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function PlaylistPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useQuery(playlistQuery(id));
  const playQueue = usePlayerStore((s) => s.playQueue);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !data) {
    return (
      <div className="page">
        <ErrorState
          message={error instanceof Error ? error.message : 'This playlist could not be loaded.'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const total = data.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  const play = (random: boolean) => {
    if (!data.tracks.length) return;
    playQueue(random ? shuffle(data.tracks) : data.tracks, 0, data.title);
  };

  return (
    <div className="page">
      <DetailHeader
        kind="Playlist"
        title={data.title}
        artwork={data.artwork}
        subtitle={data.owner ? <span>{data.owner}</span> : undefined}
        meta={
          <>
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
            <button
              type="button"
              className="primary-btn"
              onClick={() => play(false)}
              disabled={!data.tracks.length}
            >
              <Play size={14} fill="currentColor" strokeWidth={0} /> Play
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => play(true)}
              disabled={!data.tracks.length}
            >
              <Shuffle size={14} /> Shuffle
            </button>
          </>
        }
      />

      {data.tracks.length ? (
        <TrackList tracks={data.tracks} label={data.title} showAlbum />
      ) : (
        <div className="empty-state">
          <ListMusic size={28} />
          <h3>This playlist is empty</h3>
        </div>
      )}

      {data.description && (
        <p className="t-callout t-secondary mt-8 max-w-[640px] whitespace-pre-line">{data.description}</p>
      )}
    </div>
  );
}
