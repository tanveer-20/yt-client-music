import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Play, Shuffle } from 'lucide-react';
import { artistQuery } from '@/data/music/queries';
import { DetailHeader } from '@/components/music/DetailHeader';
import { TrackList } from '@/components/music/TrackList';
import { ShelfView } from '@/components/music/ShelfView';
import { DetailSkeleton } from '@/components/common/Skeletons';
import { ErrorState } from '@/components/common/States';
import { usePlayerStore } from '@/state/player';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function ArtistPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useQuery(artistQuery(id));
  const playQueue = usePlayerStore((s) => s.playQueue);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !data) {
    return (
      <div className="page">
        <ErrorState
          message={error instanceof Error ? error.message : 'This artist could not be loaded.'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const play = (random: boolean) => {
    const tracks = random ? shuffle(data.topTracks) : data.topTracks;
    if (tracks.length) playQueue(tracks, 0, data.name);
  };

  return (
    <div className="page">
      <DetailHeader
        kind="Artist"
        title={data.name}
        artwork={data.artwork}
        round
        subtitle={data.subscribers ? <span>{data.subscribers} listeners</span> : undefined}
        meta={data.description ? <span className="clamp-2">{data.description}</span> : undefined}
        actions={
          <>
            <button
              type="button"
              className="primary-btn"
              onClick={() => play(false)}
              disabled={!data.topTracks.length}
            >
              <Play size={14} fill="currentColor" strokeWidth={0} /> Play
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => play(true)}
              disabled={!data.topTracks.length}
            >
              <Shuffle size={14} /> Shuffle
            </button>
          </>
        }
      />

      {data.topTracks.length > 0 && (
        <section>
          <h2 className="shelf-title mb-2">Top Songs</h2>
          <TrackList tracks={data.topTracks} label={`${data.name} — Top Songs`} />
        </section>
      )}

      {data.shelves.map((shelf) => (
        <ShelfView key={shelf.title} shelf={shelf} />
      ))}
    </div>
  );
}
