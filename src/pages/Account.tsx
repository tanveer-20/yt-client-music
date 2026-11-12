import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { extensionRequest } from '@/bridge';
import { connectAccount, disconnectAccount, fetchAccountStatus } from '@/data/library/api';
import { useAccountStore } from '@/state/account';
import { useLocalPlaylists } from '@/library/store';
import { usePlayerStore } from '@/state/player';
import { useLibraryStore } from '@/state/library';
import { EmptyState } from '@/components/common/States';
import { formatTime } from '@/lib/format';
import type { Track } from '@/types';

function parseCookieString(input: string): Record<string, string> {
  return input
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('='))
    .filter((parts) => parts.length >= 2)
    .reduce<Record<string, string>>((result, parts) => {
      result[parts[0].trim()] = parts.slice(1).join('=');
      return result;
    }, {});
}

export default function AccountPage() {
  const account = useAccountStore();
  const playlists = useLocalPlaylists((s) => s.playlists);
  const { create, remove } = useLocalPlaylists();
  const liked = useLibraryStore((s) => s.liked);
  const recent = useLibraryStore((s) => s.recent);
  const [status, setStatus] = useState(account);
  const [cookie, setCookie] = useState('');
  const [showCookie, setShowCookie] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'extension' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const playQueue = usePlayerStore((s) => s.playQueue);

  const load = async () => {
    try {
      const serverStatus = await fetchAccountStatus();
      setStatus((prev) => ({
        ...prev,
        connected: serverStatus.connected,
        mode: serverStatus.connected ? (serverStatus.source === 'extension' ? 'extension' : 'manual') : prev.mode,
        channelName: serverStatus.channelName,
        avatarUrl: serverStatus.avatarUrl,
      }));
    } catch {
      setError('The Rem server is offline. Local library still works.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const connectExtension = async () => {
    setBusy('extension');
    setError(null);
    try {
      const auth = await extensionRequest('authState', { interactive: false }, 5000);
      if (!auth.signedIn && !auth.hasCookies) throw new Error('The extension found no signed-in YouTube cookies.');
      // Signed-in browsing is still disabled; the connection is reflected locally.
      account.setAccount({ mode: 'extension', connected: true, channelName: auth.channelName, avatarUrl: auth.avatarUrl });
      setStatus(account);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect through the extension.');
    } finally {
      setBusy(null);
    }
  };

  const connectManual = async () => {
    setBusy('connect');
    setError(null);
    try {
      const parsed = parseCookieString(cookie);
      const serverStatus = await connectAccount(parsed, 'manual');
      account.setAccount({ mode: 'manual', connected: serverStatus.connected });
      setStatus(account);
      setCookie('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect that account.');
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    setBusy('disconnect');
    try {
      await disconnectAccount();
      account.signOut();
      setStatus(account);
    } finally {
      setBusy(null);
    }
  };

  const addPlaylist = () => {
    const playlist = create(newTitle);
    if (playlist) setNewTitle('');
  };

  return (
    <div className="page max-w-[760px]">
      <header className="mb-5">
        <h1 className="t-large-title">Account</h1>
        <p className="t-callout t-secondary mt-1">
          Local library works without sign-in. YouTube cookies can be added locally for future
          signed-in browsing.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border p-4 mb-4" style={{ borderColor: 'var(--systemOrange)', color: 'var(--systemOrange)' }}>
          {error}
        </div>
      )}

      <section className="rounded-xl border border-[var(--labelDivider)] p-5 mb-5">
        <div className="row gap-2 mb-3">
          <UserRound size={17} className="text-[var(--keyColor)]" />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>YouTube account</h2>
        </div>
        <div className="row gap-2 flex-wrap">
          <button type="button" className="primary-btn" onClick={() => void connectExtension()} disabled={busy === 'extension'}>
            <ShieldCheck size={14} /> Connect extension
          </button>
          {account.connected && (
            <button type="button" className="secondary-btn" onClick={() => void signOut()} disabled={busy === 'disconnect'}>
              Disconnect
            </button>
          )}
        </div>
        <p className="t-footnote t-secondary mt-3">
          {account.connected
            ? `Connected${account.channelName ? ` as ${account.channelName}` : ''}. Signed-in library browsing is still being finished.`
            : 'Sign in with the companion extension, or paste cookies below as a fallback.'}
        </p>

        <details className="mt-4">
          <summary className="t-callout t-secondary cursor-pointer">Manual cookie fallback</summary>
          <div className="mt-3 relative">
            <input
              type={showCookie ? 'text' : 'password'}
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
              placeholder="SAPISID=…; __Secure-3PAPISID=…"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 pr-16 t-body outline-none focus:border-[var(--keyColor)]"
              aria-label="YouTube cookies"
            />
            <button type="button" className="absolute right-2 top-1.5 t-footnote t-secondary" onClick={() => setShowCookie(!showCookie)}>
              {showCookie ? 'Hide' : 'Show'}
            </button>
          </div>
          <button type="button" className="primary-btn mt-3" onClick={() => void connectManual()} disabled={!cookie.trim() || busy === 'connect'}>
            {busy === 'connect' ? 'Connecting…' : 'Connect locally'}
          </button>
          <p className="t-footnote mt-3" style={{ color: 'var(--systemOrange)' }}>
            Cookies stay in Rem server memory and are never logged, returned or written to disk.
          </p>
        </details>
      </section>

      <section className="rounded-xl border border-[var(--labelDivider)] p-5 mb-5">
        <h2 className="t-title-3" style={{ fontWeight: 700 }}>Local library</h2>
        <div className="grid grid-cols-2 gap-3 mt-4 lg:grid-cols-3">
          {[
            ['Favourites', liked.length],
            ['Recently played', recent.length],
            ['Local playlists', playlists.length],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-[var(--labelDivider)] p-4">
              <div className="t-caption t-secondary uppercase tracking-[0.08em]">{label}</div>
              <div className="t-title-1 mt-1">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--labelDivider)] p-5">
        <h2 className="t-title-3" style={{ fontWeight: 700 }}>Local playlists</h2>
        <form className="flex gap-2 mt-4" onSubmit={(event) => { event.preventDefault(); addPlaylist(); }}>
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Playlist name"
            className="grow rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body outline-none focus:border-[var(--keyColor)]"
            aria-label="New playlist name"
          />
          <button type="submit" className="primary-btn" disabled={!newTitle.trim()}>
            <Plus size={14} /> Create
          </button>
        </form>

        {playlists.length ? (
          <div className="flex flex-col gap-2 mt-4">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="track-row" style={{ minHeight: 52 }}>
                <span className="track-index">{playlist.tracks.length}</span>
                <span className="track-main">
                  <span className="track-title">{playlist.title}</span>
                  <span className="track-artist">
                    Updated {new Date(playlist.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="track-actions">
                  {playlist.tracks.length > 0 && (
                    <button type="button" className="icon-btn" onClick={() => playQueue(playlist.tracks, 0, playlist.title)}>
                      Play
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete ${playlist.title}`}
                    onClick={() => remove(playlist.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No local playlists yet" description="Create a playlist to keep a set of songs across reloads." />
        )}
      </section>
    </div>
  );
}
