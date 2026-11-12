import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, LogOut, Pause, Play, Radio, SkipBack, SkipForward, Users } from 'lucide-react';
import { useParty } from '@/party/useParty';
import { usePlayerStore } from '@/state/player';
import { Artwork } from '@/components/common/Artwork';
import { EmptyState, ErrorState } from '@/components/common/States';
import { formatTime } from '@/lib/format';

export default function ListenTogetherPage() {
  const [params] = useSearchParams();
  const party = useParty();
  const [name, setName] = useState('');
  const [code, setCode] = useState(params.get('room') || '');
  const [busy, setBusy] = useState<'host' | 'join' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [audioGate, setAudioGate] = useState(true);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);

  useEffect(() => {
    const invite = params.get('room');
    if (invite && party.status === 'idle' && name.trim()) {
      void join(invite.toUpperCase(), name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const host = async () => {
    setBusy('host');
    setFormError(null);
    try {
      await party.createRoom(`${name.trim() || 'Rem'}'s room`, name.trim() || 'Host');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not host a room.');
    } finally {
      setBusy(null);
    }
  };

  const join = async (room: string, memberName: string) => {
    setBusy('join');
    setFormError(null);
    try {
      party.connect({ room, name: memberName || 'Guest', role: 'guest' });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not join that room.');
    } finally {
      setBusy(null);
    }
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}/listen-together?room=${party.welcome?.room.code || code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFormError('Clipboard access was blocked.');
    }
  };

  const playback = party.playback;
  const isHost = party.role === 'host';

  return (
    <div className="page max-w-[760px]">
      <header className="mb-5">
        <h1 className="t-large-title">Listen Together</h1>
        <p className="t-callout t-secondary mt-1">
          Host a room, share the invite, and everyone hears the same music in sync.
        </p>
      </header>

      {party.status === 'idle' || party.status === 'closed' ? (
        <>
          {party.closedReason && <ErrorState message={party.closedReason} />}
          {formError && <ErrorState message={formError} />}

          <section className="rounded-xl border border-[var(--labelDivider)] p-5">
            <div className="row gap-2 mb-3">
              <Radio size={17} className="text-[var(--keyColor)]" />
              <h2 className="t-title-3" style={{ fontWeight: 700 }}>Start or join</h2>
            </div>
            <label className="block mb-3">
              <span className="t-body-em">Your name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex"
                className="mt-2 w-full rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body outline-none focus:border-[var(--keyColor)]"
                aria-label="Your name"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="primary-btn" onClick={() => void host()} disabled={busy === 'host'}>
                <Radio size={14} /> {busy === 'host' ? 'Creating…' : 'Host a room'}
              </button>
            </div>

            <div className="mt-5 border-t border-[var(--labelDivider)] pt-4">
              <label className="block">
                <span className="t-body-em">Room code</span>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="ABCDE6"
                    className="grow rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body tracking-[0.2em] outline-none focus:border-[var(--keyColor)]"
                    aria-label="Room code"
                  />
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!code.trim() || busy === 'join'}
                    onClick={() => void join(code.trim(), name.trim())}
                  >
                    {busy === 'join' ? 'Joining…' : 'Join'}
                  </button>
                </div>
              </label>
            </div>
          </section>

          <EmptyState
            icon={<Users size={28} />}
            title="Nothing playing together yet"
            description="Host a room on this device, then open the invite on another phone or computer."
          />
        </>
      ) : (
        <>
          <section className="rounded-xl border border-[var(--labelDivider)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="t-caption t-secondary uppercase tracking-[0.08em]">
                  {party.welcome?.room.name || 'Rem room'}
                </div>
                <div className="t-title-1 mt-1 tracking-[0.18em]">
                  {party.welcome?.room.code || code}
                </div>
                <div className="t-footnote t-secondary mt-1">
                  Host: {party.welcome?.room.hostName || 'Host'} · {party.members.length} listening
                </div>
              </div>
              <div className="row gap-2">
                <button type="button" className="secondary-btn" onClick={() => void copyInvite()}>
                  <Copy size={14} /> {copied ? 'Copied' : 'Copy invite'}
                </button>
                <button type="button" className="secondary-btn" onClick={party.leave}>
                  <LogOut size={14} /> Leave
                </button>
              </div>
            </div>
            <p className="t-footnote mt-3" style={{ color: party.status === 'connected' ? 'var(--systemGreen)' : 'var(--systemOrange)' }}>
              {party.status === 'connected'
                ? `Connected${party.latency ? ` · ${party.latency} ms` : ''}`
                : party.status === 'connecting'
                  ? 'Connecting…'
                  : 'Reconnecting…'}
              {party.role ? ` · ${party.role === 'host' ? 'Host' : 'Guest'}` : ''}
            </p>
          </section>

          {audioGate && !isHost && (
            <button
              type="button"
              className="primary-btn mt-4 w-full justify-center py-3"
              onClick={() => setAudioGate(false)}
            >
              Tap to join audio
            </button>
          )}

          {playback && (
            <section className="rounded-xl border border-[var(--labelDivider)] p-5 mt-5">
              <div className="flex items-center gap-4">
                <div className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-lg bg-[var(--genericJoeColor)]">
                  <Artwork src={playback.artwork} alt={playback.title} size={160} />
                </div>
                <div className="min-w-0">
                  <div className="t-title-2 truncate">{playback.title}</div>
                  <div className="t-callout t-secondary truncate">{playback.artist}</div>
                  <div className="t-caption t-tertiary mt-1 tabular">
                    {formatTime(progress || playback.position)} · {formatTime(duration || playback.duration)}
                  </div>
                </div>
              </div>
              {isHost && (
                <div className="row justify-center gap-1 mt-4">
                  <button type="button" className="player-btn" onClick={() => party.control('prev')} aria-label="Previous">
                    <SkipBack size={19} fill="currentColor" strokeWidth={0} />
                  </button>
                  <button type="button" className="player-btn play" onClick={() => party.control('play')} aria-label="Play">
                    <Play size={20} fill="currentColor" strokeWidth={0} />
                  </button>
                  <button type="button" className="player-btn play" onClick={() => party.control('pause')} aria-label="Pause">
                    <Pause size={20} fill="currentColor" strokeWidth={0} />
                  </button>
                  <button type="button" className="player-btn" onClick={() => party.control('next')} aria-label="Next">
                    <SkipForward size={19} fill="currentColor" strokeWidth={0} />
                  </button>
                </div>
              )}
              {!isHost && (
                <p className="t-callout t-secondary mt-3">Playback is controlled by the host.</p>
              )}
            </section>
          )}

          <section className="mt-5">
            <div className="shelf-head">
              <h2 className="shelf-title">Members</h2>
            </div>
            {party.members.length ? (
              <div className="flex flex-wrap gap-2">
                {party.members.map((member) => (
                  <span
                    key={member.id}
                    className="rounded-full px-3 py-1.5 t-callout-em"
                    style={{
                      background: 'var(--segmentedControlBG)',
                      color: member.role === 'host' ? 'var(--keyColor)' : 'var(--systemPrimary)',
                    }}
                  >
                    {member.name}
                    {member.role === 'host' ? ' · host' : ''}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyState title="No members" description="Share the invite link to add listeners." />
            )}
          </section>

          <section className="mt-5">
            <div className="shelf-head">
              <h2 className="shelf-title">Up next</h2>
            </div>
            {party.queue.length ? (
              <div className="flex flex-col gap-2">
                {party.queue.slice(Math.max(0, party.queueIndex + 1), party.queueIndex + 6).map((track) => (
                  <div key={track.id} className="track-row" style={{ minHeight: 48 }}>
                    <span className="track-art" style={{ width: 36, height: 36, flexBasis: 36 }}>
                      <Artwork src={track.thumbnail} alt="" size={96} />
                    </span>
                    <span className="track-main">
                      <span className="track-title">{track.title}</span>
                      <span className="track-artist">{track.artist}</span>
                    </span>
                    <span className="track-duration">{formatTime(track.duration)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Link to="/" className="primary-btn" />}
                title="The party queue is empty"
                description="As host, play an album or playlist and the queue appears here."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
