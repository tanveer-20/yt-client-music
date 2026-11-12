import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, Pause, Play, XCircle } from 'lucide-react';
import { connectDiscord, disconnectDiscord, getDiscordStatus, setDiscordActivity } from '@/data/integrations/api';
import { useIntegrationsStore } from '@/state/integrations';
import { usePlayerStore } from '@/state/player';
import { ErrorState } from '@/components/common/States';

export default function DiscordPage() {
  const store = useIntegrationsStore();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      store.setDiscordStatus(await getDiscordStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not check Discord status.');
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy('connect');
    setError(null);
    try {
      store.setDiscordStatus(await connectDiscord({ token: token.trim() }));
      setToken('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Discord connection failed.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    try {
      store.setDiscordStatus(await disconnectDiscord());
      store.clearDiscord();
    } finally {
      setBusy(null);
    }
  };

  const shareNowPlaying = async () => {
    setBusy('share');
    setError(null);
    const track = usePlayerStore.getState().currentTrack;
    if (!track) {
      setError('Play a song first.');
      setBusy(null);
      return;
    }
    try {
      store.setDiscordStatus(
        await setDiscordActivity({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.thumbnail,
          startedAt: Date.now(),
          paused: usePlayerStore.getState().state !== 'playing',
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update Discord presence.');
    } finally {
      setBusy(null);
    }
  };

  const status = store.discordStatus;

  return (
    <div className="page max-w-[720px]">
      <header className="mb-5">
        <h1 className="t-large-title">Discord</h1>
        <p className="t-callout t-secondary mt-1">
          Experimental: connect the local Discord client token to publish your listening as rich
          presence. The token stays on the Rem server and is never logged.
        </p>
      </header>

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      <section className="rounded-xl border border-[var(--labelDivider)] p-5">
        <div className="row gap-2 mb-3">
          <MessageCircle size={17} className="text-[var(--keyColor)]" />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>Gateway</h2>
        </div>
        {status?.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="row gap-2 t-callout">
              <CheckCircle2 size={16} className="text-[var(--systemGreen)]" />
              {status.username ? `Connected as ${status.username}` : 'Connected'}
              {status.reconnectAttempt ? ` · retry ${status.reconnectAttempt}` : ''}
            </div>
            <button type="button" className="secondary-btn" onClick={() => void disconnect()} disabled={busy === 'disconnect'}>
              Disconnect
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void connect(); }} className="flex flex-col gap-3">
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Discord user token"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 pr-16 t-body outline-none focus:border-[var(--keyColor)]"
                aria-label="Discord user token"
              />
              <button type="button" className="absolute right-2 top-1.5 t-footnote t-secondary" onClick={() => setShowToken(!showToken)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <button type="submit" className="primary-btn self-start" disabled={!token.trim() || busy === 'connect'}>
              {busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Connect
            </button>
          </form>
        )}

        {status?.error && (
          <p className="row gap-2 t-footnote mt-3" style={{ color: 'var(--systemRed)' }}>
            <XCircle size={14} /> {status.error}
          </p>
        )}
      </section>

      {status?.connected && (
        <section className="rounded-xl border border-[var(--labelDivider)] p-5 mt-4">
          <h2 className="t-title-3 mb-3" style={{ fontWeight: 700 }}>Now playing</h2>
          <button type="button" className="primary-btn" onClick={() => void shareNowPlaying()} disabled={busy === 'share'}>
            {busy === 'share' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Share current track
          </button>
          <p className="t-footnote t-secondary mt-3">
            Rem can also publish automatically on play/pause when the integration is enabled.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={store.discordShareNowPlaying}
            onClick={() => store.setDiscordShareNowPlaying(!store.discordShareNowPlaying)}
            className="mt-4 flex cursor-pointer items-center justify-between gap-6 w-full"
          >
            <span className="t-body-em">Share playback automatically</span>
            <span
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{ background: store.discordShareNowPlaying ? 'var(--keyColor)' : 'var(--systemGray4)' }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ left: 2, transform: store.discordShareNowPlaying ? 'translateX(20px)' : 'none' }}
              />
            </span>
          </button>
        </section>
      )}

      <section className="rounded-xl border border-[var(--labelDivider)] p-5 mt-4">
        <h2 className="t-title-3 mb-2" style={{ fontWeight: 700 }}>Privacy note</h2>
        <p className="t-callout t-secondary">
          User-token presence is unofficial. Disconnect after use; Discord may invalidate the token or
          change the gateway at any time.
        </p>
        <div className="row gap-3 mt-3 t-footnote t-tertiary">
          <Pause size={13} /> {status?.activity ? `Last activity: ${status.activity.title}` : 'No activity published yet'}
        </div>
      </section>
    </div>
  );
}
