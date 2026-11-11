import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { searchQuery } from '@/data/music/queries';
import { SearchField } from '@/components/music/SearchField';
import { CategoryTiles } from '@/components/music/CategoryTiles';
import { TrackList } from '@/components/music/TrackList';
import { ShelfView } from '@/components/music/ShelfView';
import { Artwork } from '@/components/common/Artwork';
import { EmptyState, ErrorState } from '@/components/common/States';
import { ListSkeleton } from '@/components/common/Skeletons';
import type { MediaItem } from '@/types';
import { usePlayerStore } from '@/state/player';
import { itemTrack } from '@/components/music/Lockups';

function TopResult({ item }: { item: MediaItem }) {
  const navigate = useNavigate();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const playable = item.kind === 'track' || item.kind === 'video';

  const open = () => {
    if (playable) {
      const track = itemTrack(item);
      playTrack(track, [track]);
      return;
    }
    if (item.kind === 'album') navigate(`/album/${encodeURIComponent(item.id)}`);
    else if (item.kind === 'artist') navigate(`/artist/${encodeURIComponent(item.id)}`);
    else if (item.kind === 'playlist') navigate(`/playlist/${encodeURIComponent(item.id)}`);
  };

  return (
    <section>
      <h2 className="shelf-title mb-3">Top result</h2>
      <button
        type="button"
        onClick={open}
        className="flex w-full max-w-[420px] items-center gap-4 rounded-xl border border-[var(--labelDivider)] p-4 text-left transition-colors hover:bg-[var(--tracklistHoverColor)]"
      >
        <div
          className="h-[76px] w-[76px] shrink-0 overflow-hidden bg-[var(--genericJoeColor)]"
          style={{ borderRadius: item.round ? '50%' : 8 }}
        >
          <Artwork src={item.artwork} alt={item.title} size={160} eager />
        </div>
        <div className="min-w-0">
          <div className="t-title-2 truncate">{item.title}</div>
          <div className="t-callout t-secondary truncate mt-0.5">{item.subtitle}</div>
          <span className="mt-2 inline-grid h-8 w-8 place-items-center rounded-full bg-[var(--keyColor)] text-white">
            <Play size={14} fill="currentColor" strokeWidth={0} />
          </span>
        </div>
      </button>
    </section>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() || '';
  const [input, setInput] = useState(q);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useQuery(searchQuery(q));

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    if (input.trim() === q) return;
    const timer = window.setTimeout(() => {
      const next = input.trim();
      if (next) setParams({ q: next }, { replace: true });
      else setParams({}, { replace: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [input, q, setParams]);

  return (
    <div className="page">
      <header className="mb-5">
        <h1 className="t-large-title">Search</h1>
      </header>

      <div className="max-w-[560px]">
        <SearchField
          value={input}
          onChange={setInput}
          onSubmit={(value) => {
            if (value) navigate(`/search?q=${encodeURIComponent(value)}`);
          }}
          placeholder="Songs, albums, artists, videos"
          autoFocus={false}
          className="h-10"
        />
      </div>

      {!q ? (
        <>
          <h2 className="shelf-title mt-8">Browse</h2>
          <CategoryTiles />
        </>
      ) : isLoading ? (
        <div className="mt-8">
          <ListSkeleton rows={9} />
        </div>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Search failed.'}
          onRetry={() => void refetch()}
        />
      ) : !data ||
        (!data.songs.length &&
          !data.albums.length &&
          !data.artists.length &&
          !data.playlists.length &&
          !data.videos.length) ? (
        <EmptyState
          title={`No results for “${q}”`}
          description="Try a different spelling, or search for a song, album or artist."
        />
      ) : (
        <div className="mt-8 flex flex-col gap-9">
          {data.top && <TopResult item={data.top} />}

          {data.songs.length > 0 && (
            <section>
              <h2 className="shelf-title mb-2">Songs</h2>
              <TrackList tracks={data.songs} label={`Search: ${q}`} showAlbum />
            </section>
          )}

          {data.albums.length > 0 && (
            <ShelfView shelf={{ title: 'Albums', items: data.albums }} />
          )}
          {data.artists.length > 0 && (
            <ShelfView shelf={{ title: 'Artists', items: data.artists }} />
          )}
          {data.playlists.length > 0 && (
            <ShelfView shelf={{ title: 'Playlists', items: data.playlists }} />
          )}
          {data.videos.length > 0 && (
            <section>
              <h2 className="shelf-title mb-2">Videos</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {data.videos.map((video) => (
                  <VideoCard key={video.id} item={video} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function VideoCard({ item }: { item: MediaItem }) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const track = itemTrack(item);
  return (
    <button
      type="button"
      className="lockup group"
      onClick={() => playTrack(track, [track])}
      title={item.title}
    >
      <div className="lockup-art" style={{ aspectRatio: '16 / 9' }}>
        <Artwork src={item.artwork} alt={item.title} size={344} />
        <span className="lockup-play">
          <Play size={15} fill="currentColor" strokeWidth={0} />
        </span>
      </div>
      <div className="min-w-0">
        <div className="lockup-title">{item.title}</div>
        <div className="lockup-subtitle">{item.subtitle}</div>
      </div>
    </button>
  );
}
