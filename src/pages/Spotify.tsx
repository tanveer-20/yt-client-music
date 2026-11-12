import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, ListPlus, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { connectSpotify, disconnectSpotify, getSpotifyStatus, importSpotifyPlaylist } from '@/data/integrations/api';
import { useIntegrationsStore } from '@/state/integrations';
import { usePlayerStore } from '@/state/player';
import { Artwork } from '@/components/common/Artwork';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { formatLongTime } from '@/lib/format';

export default function SpotifyPage() {
  const store = useIntegrationsStore();
  const [cookie, setCookie] = useState('');
  const [showCookie, setShowCookie] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'import' | 'status' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playQueue = usePlayerStore((s) => s.playQueue);

  const refresh = async () => {
    setBusy('status');
    try {
      store.setSpotifyStatus(await getSpotifyStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not check Spotify status.');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy('connect');
    setError(null);
    try {
      store.setSpotifyStatus(await connectSpotify(cookie.trim()));
      setCookie('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Spotify connection failed.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    try {
      store.setSpotifyStatus(await disconnectSpotify());
      store.clearSpotify();
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    setBusy('import');
    setError(null);
    try {
      const result = await importSpotifyPlaylist({ playlistUrl: playlistUrl.trim(), limit });
      store.setLastImport(result);
      setPlaylistUrl('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Spotify import failed.');
    } finally {
      setBusy(null);
    }
  };

  const result = store.lastImport;
  const matched = result?.matches.filter((match) => match.matched) ?? [];

  return (
    <div className="page max-w-[860px]">
      <header className="mb-5">
        <h1 className="t-large-title">Spotify import</h1>
        <p className="t-callout t-secondary mt-1">
          Paste your browser’s <code>sp_dc</code> cookie on this page. It is sent only to the local Rem
          server and is never logged, returned or stored.
        </p>
      </header>

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      <section className="rounded-xl border border-[var(--labelDivider)] p-5">
        <div className="row gap-2 mb-3">
          <Cloud size={17} className="text-[var(--keyColor)]" />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>Connection</h2>
        </div>
        {busy === 'status' ? (
          <LoadingState label="Checking Spotify" />
        ) : store.spotifyConnected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="row gap-2 t-callout">
              <CheckCircle2 size={16} className="text-[var(--systemGreen)]" />
              Connected
              {store.spotifyAnonymous ? ' (anonymous)' : ''}
              {store.spotifyTokenExpiresAt ? ` · expires ${new Date(store.spotifyTokenExpiresAt).toLocaleTimeString()}` : ''}
            </div>
            <button type="button" className="secondary-btn" onClick={() => void disconnect()} disabled={busy === 'disconnect'}>
              Disconnect
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void connect(); }} className="flex flex-col gap-3">
            <div className="relative">
              <input
                type={showCookie ? 'text' : 'password'}
                value={cookie}
                onChange={(event) => setCookie(event.target.value)}
                placeholder="sp_dc cookie value"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 pr-16 t-body outline-none focus:border-[var(--keyColor)]"
                aria-label="Spotify sp_dc cookie"
              />
              <button type="button" className="absolute right-2 top-1.5 t-footnote t-secondary" onClick={() => setShowCookie(!showCookie)}>
                {showCookie ? 'Hide' : 'Show'}
              </button>
            </div>
            <button type="submit" className="primary-btn self-start" disabled={!cookie.trim() || busy === 'connect'}>
              {busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Connect
            </button>
          </form>
        )}
      </section>

      {store.spotifyConnected && (
        <section className="rounded-xl border border-[var(--labelDivider)] p-5 mt-4">
          <h2 className="t-title-3 mb-3" style={{ fontWeight: 700 }}>Import playlist</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={playlistUrl}
              onChange={(event) => setPlaylistUrl(event.target.value)}
              placeholder="https://open.spotify.com/playlist/…"
              className="grow rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body outline-none focus:border-[var(--keyColor)]"
              aria-label="Spotify playlist link"
            />
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body"
              aria-label="Import limit"
            >
              {[25, 50, 100, 200].map((value) => (
                <option key={value} value={value}>{value} tracks</option>
              ))}
            </select>
            <button type="button" className="primary-btn" onClick={() => void runImport()} disabled={!playlistUrl.trim() || busy === 'import'}>
              {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />} Import
            </button>
          </div>
          <p className="t-footnote t-secondary mt-2">
            Large playlists take longer because every track is matched to YouTube Music.
          </p>
        </section>
      )}

      {result && (
        <section className="mt-6">
          <div className="shelf-head">
            <h2 className="shelf-title">{result.playlist.name}</h2>
            <button
              type="button"
              className="secondary-btn"
              onClick={() =>
                playQueue(
                  matched.map((match) => match.matched!),
                  0,
                  result.playlist.name
                )
              }
            >
              Play matched
            </button>
          </div>
          <div className="row gap-3 t-callout t-secondary mb-3">
            <RefreshCw size={13} /> {result.matchedCount}/{result.totalCount} matched ({Math.round(result.matchRate * 100)}%)
          </div>
          {matched.length ? (
            <div className="tracklist">
              {matched.map((match, index) => {
                const track = match.matched!;
                return (
                  <div key={`${match.source.title}:${index}`} className="track-row" role="button" tabIndex={0} style={{ minHeight: 52 }}
                    onClick={() => playQueue(matched.map((item) => item.matched!), index, result.playlist.name)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') playQueue(matched.map((item) => item.matched!), index, result.playlist.name);
                    }}
                  >
                    <span className="track-index">{index + 1}</span>
                    <span className="track-art">
                      <Artwork src={track.thumbnail} alt="" size={96} />
                    </span>
                    <span className="track-main">
                      <span className="track-title">{track.title}</span>
                      <span className="track-artist">{match.source.title} · {match.source.artist}</span>
                    </span>
                    <span className="track-duration">{formatLongTime(track.duration)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No matches" description="Try a smaller limit or check the playlist link." />
          )}
        </section>
      )}

      {!result && !store.spotifyConnected && (
        <EmptyState
          icon={<Cloud size={28} />}
          title="No playlist imported yet"
          description="Connect Spotify, then paste a playlist link to import it."
        />
      )}
    </div>
  );
}
