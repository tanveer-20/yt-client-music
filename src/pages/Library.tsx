import { Link, useSearchParams } from 'react-router-dom';
import { Clock3, Heart, Play, Shuffle } from 'lucide-react';
import { useLibraryStore } from '@/state/library';
import { usePlayerStore } from '@/state/player';
import { TrackList } from '@/components/music/TrackList';
import { EmptyState } from '@/components/common/States';
import { formatLongTime } from '@/lib/format';
import type { Track } from '@/types';

type Tab = 'liked' | 'recent' | 'all';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function TrackSection({
  title,
  icon,
  tracks,
  label,
}: {
  title: string;
  icon: React.ReactNode;
  tracks: Track[];
  label: string;
}) {
  const playQueue = usePlayerStore((s) => s.playQueue);

  return (
    <section>
      <div className="shelf-head">
        <h2 className="shelf-title row gap-2">
          {icon}
          {title}
        </h2>
        {tracks.length > 0 && (
          <div className="row gap-2">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => playQueue(tracks, 0, label)}
            >
              <Play size={13} fill="currentColor" strokeWidth={0} /> Play
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => playQueue(shuffle(tracks), 0, label)}
            >
              <Shuffle size={13} /> Shuffle
            </button>
          </div>
        )}
      </div>
      {tracks.length > 0 ? (
        <TrackList tracks={tracks} label={label} showAlbum />
      ) : (
        <EmptyState
          icon={icon}
          title={`No ${title.toLowerCase()} yet`}
          description="Tracks you save and play will show up here."
        />
      )}
    </section>
  );
}

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'liked' || raw === 'recent' ? raw : 'all';
  const liked = useLibraryStore((s) => s.liked);
  const recent = useLibraryStore((s) => s.recent);

  const totalSeconds = [...liked, ...recent].reduce((sum, track) => sum + (track.duration || 0), 0);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'liked', label: 'Favourites' },
    { id: 'recent', label: 'Recently Played' },
  ];

  return (
    <div className="page">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-large-title">Library</h1>
          <p className="t-callout t-secondary mt-1">
            {liked.length} favourite{liked.length === 1 ? '' : 's'} · {recent.length} recent ·{' '}
            {formatLongTime(totalSeconds)} of listening
          </p>
        </div>
        <div className="row gap-1 rounded-full p-1" style={{ background: 'var(--segmentedControlBG)' }}>
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="rounded-full px-3.5 py-1.5 t-callout-em"
              style={
                tab === entry.id
                  ? { background: 'var(--segmentedControlSelectedBG)', color: 'var(--systemPrimary)' }
                  : { color: 'var(--systemSecondary)' }
              }
              onClick={() => {
                if (entry.id === 'all') setParams({}, { replace: true });
                else setParams({ tab: entry.id }, { replace: true });
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-10">
        {(tab === 'all' || tab === 'liked') && (
          <TrackSection
            title="Favourites"
            icon={<Heart size={18} className="text-[var(--keyColor)]" />}
            tracks={liked}
            label="Favourites"
          />
        )}

        {(tab === 'all' || tab === 'recent') && (
          <TrackSection
            title="Recently Played"
            icon={<Clock3 size={18} className="text-[var(--keyColor)]" />}
            tracks={recent}
            label="Recently Played"
          />
        )}
      </div>

      {liked.length === 0 && recent.length === 0 && (
        <div className="mt-6">
          <Link to="/" className="primary-btn">
            Browse music
          </Link>
        </div>
      )}
    </div>
  );
}
