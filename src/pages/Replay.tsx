import { useRef, useState } from 'react';
import { BarChart3, Download, Share2, Trash2, Upload } from 'lucide-react';
import { useReplaySummary } from '@/replay/useReplaySummary';
import { usePlayerStore } from '@/state/player';
import { Artwork } from '@/components/common/Artwork';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { formatLongTime } from '@/lib/format';
import type { ReplayRange, ReplayTopItem } from '@/replay/types';

const RANGES: Array<{ id: ReplayRange; label: string }> = [
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
  { id: 'year', label: '1 year' },
  { id: 'all', label: 'All time' },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--labelDivider)] p-4">
      <div className="t-caption t-secondary uppercase tracking-[0.08em]">{label}</div>
      <div className="t-title-1 mt-1">{value}</div>
    </div>
  );
}

function RankRow({ item, rank }: { item: ReplayTopItem; rank: number }) {
  const playQueue = usePlayerStore((s) => s.playQueue);
  const track = item.kind === 'track'
    ? {
        id: item.id,
        title: item.name,
        artist: item.artist || 'Unknown artist',
        thumbnail: item.artwork || '',
        duration: item.duration || 0,
      }
    : null;

  return (
    <div className="track-row" role={track ? 'button' : undefined} tabIndex={track ? 0 : undefined}
      onClick={() => track && playQueue([track], 0, `Replay: ${item.name}`)}
      onKeyDown={(event) => {
        if (track && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          playQueue([track], 0, `Replay: ${item.name}`);
        }
      }}
      style={{ minHeight: 54 }}
    >
      <span className="track-index">{rank}</span>
      <span className="track-art">
        <Artwork src={item.artwork} alt="" size={96} />
      </span>
      <span className="track-main">
        <span className="track-title">{item.name}</span>
        <span className="track-artist">{item.artist || (item.kind === 'album' ? 'Album' : 'Artist')}</span>
      </span>
      <span className="track-duration t-caption tabular">
        {item.plays} play{item.plays === 1 ? '' : 's'} · {formatLongTime(item.seconds)}
      </span>
    </div>
  );
}

export default function ReplayPage() {
  const { range, setRange, summary, recent, loading, error, reload, downloadBackup, readBackup, reset } = useReplaySummary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState<'import' | 'export' | 'poster' | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const playQueue = usePlayerStore((s) => s.playQueue);

  const sharePoster = async () => {
    if (!summary) return;
    setBackupBusy('poster');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
        gradient.addColorStop(0, '#1f1f1f');
        gradient.addColorStop(1, '#2b1114');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1080, 1080);
        ctx.fillStyle = '#fa586a';
        ctx.font = '700 44px DM Sans, system-ui, sans-serif';
        ctx.fillText('Rem · Replay', 72, 120);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 108px DM Sans, system-ui, sans-serif';
        ctx.fillText(`${Math.round(summary.seconds / 60).toLocaleString()} min`, 72, 260);
        ctx.fillStyle = '#b8b8bd';
        ctx.font = '500 34px DM Sans, system-ui, sans-serif';
        ctx.fillText(`${summary.plays.toLocaleString()} plays · ${summary.uniqueArtists} artists`, 72, 330);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 38px DM Sans, system-ui, sans-serif';
        summary.topArtists.slice(0, 3).forEach((artist, index) => {
          ctx.fillText(`${index + 1}. ${artist.name}`, 72, 470 + index * 66);
        });
        summary.topTracks.slice(0, 3).forEach((track, index) => {
          ctx.fillStyle = '#d8d8dc';
          ctx.fillText(`${track.name}`, 72, 700 + index * 66);
        });
        const url = canvas.toDataURL('image/png');
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'rem-replay-poster.png';
        anchor.click();
      }
      setBackupMessage('Poster downloaded.');
    } catch {
      setBackupMessage('Could not create the poster.');
    } finally {
      setBackupBusy(null);
    }
  };

  if (loading && !summary) return <LoadingState label="Loading Replay" />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <div className="page">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-large-title">Replay</h1>
          <p className="t-callout t-secondary mt-1">Your listening is stored locally on this device.</p>
        </div>
        <div className="row gap-1 rounded-full p-1" style={{ background: 'var(--segmentedControlBG)' }}>
          {RANGES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="rounded-full px-3.5 py-1.5 t-callout-em"
              style={
                range === entry.id
                  ? { background: 'var(--segmentedControlSelectedBG)', color: 'var(--systemPrimary)' }
                  : { color: 'var(--systemSecondary)' }
              }
              onClick={() => setRange(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-6">
        <StatCard label="Minutes" value={Math.round((summary?.seconds || 0) / 60).toLocaleString()} />
        <StatCard label="Plays" value={(summary?.plays || 0).toLocaleString()} />
        <StatCard label="Artists" value={(summary?.uniqueArtists || 0).toLocaleString()} />
        <StatCard label="Albums" value={(summary?.uniqueAlbums || 0).toLocaleString()} />
      </div>

      <section className="mb-7 rounded-xl border border-[var(--labelDivider)] p-5">
        <div className="row gap-2 mb-4">
          <BarChart3 size={17} className="text-[var(--keyColor)]" />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>Activity</h2>
        </div>
        {summary?.activity.length ? (
          <div className="flex h-[130px] items-end gap-1">
            {summary.activity.map((point) => {
              const max = Math.max(...summary.activity.map((entry) => entry.seconds), 1);
              return (
                <div
                  key={point.date}
                  title={`${point.date}: ${formatLongTime(point.seconds)}`}
                  className="grow rounded-t-md"
                  style={{ height: `${Math.max(3, (point.seconds / max) * 100)}%`, background: 'var(--keyColor)', opacity: 0.72 }}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState title="No activity yet" description="Play a few songs and this chart will fill in." />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="shelf-head">
            <h2 className="shelf-title">Top songs</h2>
          </div>
          {summary?.topTracks.length ? (
            <div className="tracklist">
              {summary.topTracks.map((item, index) => (
                <RankRow key={item.id} item={item} rank={index + 1} />
              ))}
            </div>
          ) : (
            <EmptyState title="No top songs yet" />
          )}
        </section>

        <section>
          <div className="shelf-head">
            <h2 className="shelf-title">Top artists</h2>
          </div>
          {summary?.topArtists.length ? (
            <div className="tracklist">
              {summary.topArtists.map((item, index) => (
                <RankRow key={item.id} item={item} rank={index + 1} />
              ))}
            </div>
          ) : (
            <EmptyState title="No top artists yet" />
          )}
        </section>

        <section>
          <div className="shelf-head">
            <h2 className="shelf-title">Top albums</h2>
          </div>
          {summary?.topAlbums.length ? (
            <div className="tracklist">
              {summary.topAlbums.map((item, index) => (
                <RankRow key={item.id} item={item} rank={index + 1} />
              ))}
            </div>
          ) : (
            <EmptyState title="No top albums yet" />
          )}
        </section>

        <section>
          <div className="shelf-head">
            <h2 className="shelf-title">Recent plays</h2>
          </div>
          {recent.length ? (
            <div className="tracklist">
              {recent.map((play, index) => (
                <div key={`${play.trackId}:${play.startedAt}:${index}`} className="track-row" style={{ minHeight: 50 }}>
                  <span className="track-index">{index + 1}</span>
                  <span className="track-art">
                    <Artwork src={play.artwork} alt="" size={96} />
                  </span>
                  <span className="track-main">
                    <span className="track-title">{play.title}</span>
                    <span className="track-artist">{play.artist}</span>
                  </span>
                  <span className="track-duration">{formatLongTime(play.playedSeconds)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No plays recorded yet" />
          )}
        </section>
      </div>

      <section className="rounded-xl border border-[var(--labelDivider)] p-5 mt-8">
        <h2 className="t-title-3" style={{ fontWeight: 700 }}>Backup & sharing</h2>
        <p className="t-footnote t-secondary mt-1">
          Replay data never leaves this device. Export a JSON backup before reinstalling, or import a
          phone backup to merge it.
        </p>
        <div className="row gap-2 mt-4 flex-wrap">
          <button type="button" className="secondary-btn" onClick={() => void downloadBackup()}>
            <Download size={14} /> Export backup
          </button>
          <button type="button" className="secondary-btn" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Import backup
          </button>
          <button type="button" className="secondary-btn" onClick={() => void sharePoster()} disabled={backupBusy === 'poster'}>
            <Share2 size={14} /> {backupBusy === 'poster' ? 'Drawing…' : 'Share poster'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              if (window.confirm('Delete all Replay data on this device?')) void reset();
            }}
          >
            <Trash2 size={14} /> Clear
          </button>
        </div>
        {backupMessage && <p className="t-footnote t-secondary mt-3">{backupMessage}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void readBackup(file).then(() => setBackupMessage('Backup imported.')).catch((caught: unknown) =>
              setBackupMessage(caught instanceof Error ? caught.message : 'Import failed.')
            );
            event.target.value = '';
          }}
        />
      </section>

      {summary?.topTracks.length ? (
        <div className="mt-8">
          <button
            type="button"
            className="primary-btn"
            onClick={() =>
              playQueue(
                summary.topTracks.map((item) => ({
                  id: item.id,
                  title: item.name,
                  artist: item.artist || 'Unknown artist',
                  thumbnail: item.artwork || '',
                  duration: item.duration || 0,
                })),
                0,
                'Replay top songs'
              )
            }
          >
            Play top songs
          </button>
        </div>
      ) : null}
    </div>
  );
}
