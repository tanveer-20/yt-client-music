import { RiMusic2Line, RiSearchLine, RiPlayFill, RiHeartFill } from 'react-icons/ri';
import { usePlayerStore } from '../../stores/playerStore';
import { usePlaylistStore } from '../../stores/playlistStore';
import { useUIStore } from '../../stores/uiStore';
import { TrackCard } from '../Search/TrackCard';

export function HomePage() {
  const { history, playQueue } = usePlayerStore();
  const { playlists, favorites } = usePlaylistStore();
  const { setView, navigateToPlaylist } = useUIStore();

  const hasHistory = history.length > 0;
  const hasPlaylists = playlists.length > 0;
  const hasFavorites = favorites.length > 0;

  // Get greeting based on time of day
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] safe-scroll-bottom">
        {/* Header */}
        <h1 className="page-title mb-6">{greeting}</h1>

        {/* Quick actions if nothing played yet */}
        {!hasHistory && !hasPlaylists && !hasFavorites && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-white/[0.05] flex items-center justify-center mb-5">
              <RiMusic2Line size={36} className="text-brand-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Welcome to YT Music</h2>
            <p className="text-white/40 text-sm text-center max-w-xs mb-6">
              Search for your favorite songs and start listening in the highest quality
            </p>
            <button
              onClick={() => setView('search')}
              className="btn-primary flex items-center gap-2"
            >
              <RiSearchLine size={18} />
              Start Searching
            </button>
          </div>
        )}

        {/* Liked Songs Quick Card */}
        {hasFavorites && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-header mb-0">Liked Songs</h2>
              <button
                onClick={() => playQueue(favorites, 0)}
                className="flex items-center gap-1.5 text-xs text-brand-400 font-semibold uppercase tracking-wider hover:text-brand-300 transition-colors"
              >
                <RiPlayFill size={14} />
                Play Liked
              </button>
            </div>
            <div className="space-y-0.5">
              {favorites.slice(0, 5).map((track, i) => (
                <TrackCard
                  key={`fav-${track.id}-${i}`}
                  track={track}
                  index={i}
                  tracks={favorites}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recently Played */}
        {hasHistory && (
          <section className="mb-8">
            <h2 className="section-header">Recently Played</h2>
            <div className="space-y-0.5">
              {Array.from(new Map(history.map((t) => [t.id, t])).values())
                .slice(0, 10)
                .map((track, i, arr) => (
                  <TrackCard
                    key={`history-${track.id}-${i}`}
                    track={track}
                    index={i}
                    tracks={arr}
                  />
                ))}
            </div>
          </section>
        )}

        {/* Your Playlists */}
        {hasPlaylists && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-header mb-0">Your Playlists</h2>
              <button
                onClick={() => setView('playlists')}
                className="text-sm text-brand-400 font-medium"
              >
                See All
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {playlists.slice(0, 4).map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => navigateToPlaylist(pl.id)}
                  className="card p-3 text-left active:scale-[0.97] spring-fast"
                >
                  {/* Thumbnail grid */}
                  <div className="aspect-square rounded-xl overflow-hidden mb-3 bg-white/[0.03]">
                    {pl.tracks.length >= 4 ? (
                      <div className="grid grid-cols-2 h-full">
                        {pl.tracks.slice(0, 4).map((t, i) => (
                          <img
                            key={`${t.id}-${i}`}
                            src={t.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ))}
                      </div>
                    ) : pl.tracks.length > 0 ? (
                      <img
                        src={pl.tracks[0].thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <RiMusic2Line size={32} className="text-white/10" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold line-clamp-1">{pl.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
