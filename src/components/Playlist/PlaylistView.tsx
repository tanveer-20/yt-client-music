import { useState } from 'react';
import {
  RiPlayFill,
  RiShuffleLine,
  RiDeleteBinLine,
  RiMusic2Line,
  RiAddLine,
  RiArrowLeftSLine,
  RiEditLine,
  RiCheckLine,
  RiHeartFill,
} from 'react-icons/ri';
import { usePlayerStore } from '../../stores/playerStore';
import { usePlaylistStore } from '../../stores/playlistStore';
import { useUIStore } from '../../stores/uiStore';
import { TrackCard } from '../Search/TrackCard';
import { formatTime } from '../../utils/format';

// ─── Playlist List View ──────────────────────────────────────

export function PlaylistListView() {
  const { playlists, favorites, createPlaylist } = usePlaylistStore();
  const { navigateToPlaylist } = useUIStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (newName.trim()) {
      const id = createPlaylist(newName.trim());
      setNewName('');
      setShowCreate(false);
      navigateToPlaylist(id);
    }
  };

  const hasAny = playlists.length > 0 || favorites.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] safe-scroll-bottom">
        <div className="flex items-center justify-between mb-4">
          <h1 className="page-title">Library</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-ghost text-brand-400"
            aria-label="Create playlist"
          >
            <RiAddLine size={24} />
          </button>
        </div>

        {/* Create playlist form */}
        {showCreate && (
          <div className="flex items-center gap-2 mb-4 animate-fade-in">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Playlist name..."
              className="search-bar flex-1"
              autoFocus
            />
            <button onClick={handleCreate} className="btn-primary py-3 px-5">
              Create
            </button>
          </div>
        )}

        {/* Playlist grid */}
        {hasAny ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {/* Liked Songs Special Card */}
            <button
              onClick={() => navigateToPlaylist('favorites')}
              className="card p-3 text-left active:scale-[0.97] spring-fast"
            >
              <div className="aspect-square rounded-xl overflow-hidden mb-3 bg-gradient-to-br from-rose-600 via-brand-600 to-amber-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
                <RiHeartFill size={42} className="text-white" />
              </div>
              <p className="text-sm font-bold text-white line-clamp-1">Liked Songs</p>
              <p className="text-xs text-white/50 mt-0.5">
                {favorites.length} track{favorites.length !== 1 ? 's' : ''}
              </p>
            </button>

            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => navigateToPlaylist(pl.id)}
                className="card p-3 text-left active:scale-[0.97] spring-fast"
              >
                <div className="aspect-square rounded-xl overflow-hidden mb-3 bg-white/[0.03]">
                  {pl.tracks.length >= 4 ? (
                    <div className="grid grid-cols-2 h-full">
                      {pl.tracks.slice(0, 4).map((t, i) => (
                        <img key={`${t.id}-${i}`} src={t.thumbnail} alt="" className="w-full h-full object-cover" />
                      ))}
                    </div>
                  ) : pl.tracks.length > 0 ? (
                    <img src={pl.tracks[0].thumbnail} alt="" className="w-full h-full object-cover" />
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
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <RiMusic2Line size={48} className="text-white/10 mb-4" />
            <p className="text-white/30 text-sm mb-1">No playlists yet</p>
            <p className="text-white/20 text-xs mb-4">Create one to save your favorite tracks</p>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <RiAddLine size={16} />
              Create Playlist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Playlist Detail View ────────────────────────────────────

export function PlaylistDetailView() {
  const { activePlaylistId, setView } = useUIStore();
  const { playlists, favorites, renamePlaylist, deletePlaylist } = usePlaylistStore();
  const { playQueue } = usePlayerStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const isFav = activePlaylistId === 'favorites';
  const playlist = isFav
    ? { id: 'favorites', name: 'Liked Songs', tracks: favorites, createdAt: 0, updatedAt: 0 }
    : playlists.find((p) => p.id === activePlaylistId);

  if (!playlist) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-white/30">Playlist not found</p>
        <button onClick={() => setView('playlists')} className="btn-secondary mt-4 text-sm">
          Back to Library
        </button>
      </div>
    );
  }

  const totalDuration = playlist.tracks.reduce((sum, t) => sum + t.duration, 0);

  const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      playQueue(playlist.tracks, 0);
    }
  };

  const handleShufflePlay = () => {
    if (playlist.tracks.length > 0) {
      const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
      playQueue(shuffled, 0);
    }
  };

  const handleDelete = () => {
    deletePlaylist(playlist.id);
    setView('playlists');
  };

  const startEditing = () => {
    setEditName(playlist.name);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (editName.trim()) {
      renamePlaylist(playlist.id, editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] safe-scroll-bottom">
        {/* Back button */}
        <button
          onClick={() => setView('playlists')}
          className="flex items-center gap-1 text-brand-400 text-sm font-medium mb-4
            active:scale-95 transition-transform"
        >
          <RiArrowLeftSLine size={20} />
          Library
        </button>

        {/* Playlist header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  className="search-bar flex-1 text-xl font-bold"
                  autoFocus
                />
                <button onClick={saveEdit} className="btn-ghost text-brand-400">
                  <RiCheckLine size={22} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <h1 className="page-title flex-1 line-clamp-1">{playlist.name}</h1>
                {!isFav && (
                  <button onClick={startEditing} className="btn-ghost">
                    <RiEditLine size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-white/40 mt-1">
            {playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}
            {totalDuration > 0 && ` · ${formatTime(totalDuration)}`}
          </p>
        </div>

        {/* Action buttons */}
        {playlist.tracks.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <button onClick={handlePlayAll} className="btn-primary flex items-center gap-2">
              <RiPlayFill size={18} />
              Play
            </button>
            <button onClick={handleShufflePlay} className="btn-secondary flex items-center gap-2">
              <RiShuffleLine size={18} />
              Shuffle
            </button>
            <div className="flex-1" />
            {!isFav && (
              <button onClick={handleDelete} className="btn-ghost text-white/30 hover:text-brand-400">
                <RiDeleteBinLine size={18} />
              </button>
            )}
          </div>
        )}

        {/* Track list */}
        {playlist.tracks.length > 0 ? (
          <div className="space-y-0.5">
            {playlist.tracks.map((track, i) => (
              <TrackCard
                key={`${track.id}-${i}`}
                track={track}
                index={i}
                tracks={playlist.tracks}
                showIndex
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <RiMusic2Line size={40} className="text-white/10 mb-3" />
            <p className="text-white/30 text-sm">This playlist is empty</p>
            <p className="text-white/20 text-xs mt-1">Search for tracks to add</p>
            <button
              onClick={() => setView('search')}
              className="btn-secondary mt-4 text-sm"
            >
              Find Music
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
