import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useAddonsStore } from '@/state/addons';
import { usePlayerStore } from '@/state/player';
import { TrackList } from '@/components/music/TrackList';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import type { Addon, AddonTrack } from '@/data/addons/api';
import type { Track } from '@/types';

function addonToTrack(item: AddonTrack): Track {
  return {
    id: `${item.addonId}:${item.id}`,
    title: item.title,
    artist: item.artist,
    album: item.album,
    thumbnail: item.thumbnail || '',
    duration: item.duration,
    source: 'addon',
    addonId: item.addonId,
    streamUrl: `/api/addons/stream/${encodeURIComponent(item.addonId)}/${encodeURIComponent(item.id)}`,
  };
}

function StatusBadge({ addon }: { addon: Addon }) {
  const label = addon.status === 'ready' ? 'Ready' : addon.status === 'unreachable' ? 'Unreachable' : 'Error';
  const colour =
    addon.status === 'ready'
      ? 'var(--systemGreen)'
      : addon.status === 'unreachable'
        ? 'var(--systemOrange)'
        : 'var(--systemRed)';
  return (
    <span className="t-caption" style={{ color: colour }}>
      {label}
    </span>
  );
}

export default function AddonsPage() {
  const {
    addons,
    loaded,
    loading,
    error,
    query,
    searchLoading,
    searchError,
    results,
    load,
    add,
    remove,
    toggle,
    move,
    refresh,
    search,
    clearSearch,
  } = useAddonsStore();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const playQueue = usePlayerStore((s) => s.playQueue);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!url.trim()) return;
    setBusy('add');
    try {
      await add(url.trim());
      setUrl('');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not add that addon.');
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    try {
      await action();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Addon action failed.');
    } finally {
      setBusy(null);
    }
  };

  const tracks = results.map(addonToTrack);

  return (
    <div className="page max-w-[860px]">
      <header className="mb-5">
        <h1 className="t-large-title">Addons</h1>
        <p className="t-callout t-secondary mt-1">
          Add HTTP music sources. Rem searches enabled addons and proxies their audio so seeking and
          Range requests keep working.
        </p>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load(true)} />}

      <section className="rounded-xl border border-[var(--labelDivider)] p-5 mb-5">
        <div className="row gap-2 mb-3">
          <Package size={17} className="text-[var(--keyColor)]" />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>Add an addon</h2>
        </div>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/addon"
              spellCheck={false}
              inputMode="url"
              className="grow rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body outline-none focus:border-[var(--keyColor)]"
              aria-label="Addon base URL"
            />
            <button type="submit" className="primary-btn" disabled={busy === 'add'}>
              <Plus size={14} /> {busy === 'add' ? 'Adding…' : 'Add addon'}
            </button>
          </div>
          {formError && <p className="t-footnote" style={{ color: 'var(--systemRed)' }}>{formError}</p>}
          <p className="t-footnote t-secondary">
            Rem reads <code>{'{base}/manifest.json'}</code>, searches <code>{'{base}/search?q='}</code>,
            and streams <code>{'{base}/stream/{id}'}</code>. Never add an addon you do not trust.
          </p>
        </form>
      </section>

      <section className="mb-5">
        <div className="shelf-head">
          <h2 className="shelf-title">Installed addons</h2>
        </div>
        {loading && !loaded ? (
          <LoadingState label="Loading addons" />
        ) : addons.length === 0 ? (
          <EmptyState
            icon={<Package size={28} />}
            title="No addons yet"
            description="Add a base URL above to start using third-party music sources."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {addons.map((addon, index) => (
              <article
                key={addon.id}
                className="rounded-xl border border-[var(--labelDivider)] p-4"
                aria-disabled={!addon.enabled}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="row gap-2">
                      <h3 className="t-body-em truncate">{addon.manifest?.name || addon.base}</h3>
                      <StatusBadge addon={addon} />
                    </div>
                    <p className="t-footnote t-secondary mt-1">
                      {addon.manifest?.description || 'No description provided.'}
                    </p>
                    <p className="t-caption t-tertiary mt-1 truncate">
                      {addon.manifest?.version ? `v${addon.manifest.version} · ` : ''}
                      {addon.manifest?.author ? `${addon.manifest.author} · ` : ''}
                      {addon.base}
                    </p>
                    {addon.error && (
                      <p className="t-footnote mt-1" style={{ color: 'var(--systemRed)' }}>
                        {addon.error}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={addon.enabled}
                    aria-label={addon.enabled ? `Disable ${addon.id}` : `Enable ${addon.id}`}
                    onClick={() => void runAction(addon.id, () => toggle(addon.id, !addon.enabled))}
                    className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                    style={{ background: addon.enabled ? 'var(--keyColor)' : 'var(--systemGray4)' }}
                  >
                    <span
                      className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                      style={{ left: 2, transform: addon.enabled ? 'translateX(20px)' : 'none' }}
                    />
                  </button>
                </div>

                <div className="row gap-1 mt-3">
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={index === 0 || busy === addon.id}
                    aria-label={`Move ${addon.id} up`}
                    onClick={() => void runAction(addon.id, () => move(addon.id, -1))}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={index === addons.length - 1 || busy === addon.id}
                    aria-label={`Move ${addon.id} down`}
                    onClick={() => void runAction(addon.id, () => move(addon.id, 1))}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={busy === addon.id}
                    aria-label={`Refresh ${addon.id}`}
                    onClick={() => void runAction(addon.id, () => refresh(addon.id))}
                  >
                    <RefreshCw size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={busy === addon.id}
                    aria-label={`Remove ${addon.id}`}
                    onClick={() => void runAction(addon.id, () => remove(addon.id))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="shelf-head">
          <h2 className="shelf-title">Search addons</h2>
          {query && (
            <button type="button" className="secondary-btn" onClick={clearSearch}>
              Clear
            </button>
          )}
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const value = (event.currentTarget.elements.namedItem('addonQuery') as HTMLInputElement)
              .value;
            if (value.trim()) void search(value.trim());
          }}
        >
          <input
            name="addonQuery"
            defaultValue={query}
            placeholder="Search addon music"
            className="grow rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body outline-none focus:border-[var(--keyColor)]"
            aria-label="Search addons"
          />
          <button type="submit" className="primary-btn" disabled={searchLoading}>
            <Search size={14} /> {searchLoading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {searchError && <ErrorState message={searchError} onRetry={() => void search(query)} />}
        {!searchError && searchLoading && <LoadingState label="Searching addons" />}
        {!searchError && !searchLoading && query && results.length === 0 && (
          <EmptyState title="No addon results" description="No enabled addon returned matches." />
        )}
        {tracks.length > 0 && (
          <div className="mt-4">
            <TrackList
              tracks={tracks}
              label={`Addon search: ${query}`}
              showAlbum
            />
          </div>
        )}
        {tracks.length > 0 && (
          <button
            type="button"
            className="secondary-btn mt-3"
            onClick={() => playQueue(tracks, 0, `Addon search: ${query}`)}
          >
            Play all
          </button>
        )}
      </section>
    </div>
  );
}
