/**
 * SearchView — iOS-style search with debounced input and results.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { RiSearchLine, RiCloseLine, RiPlayFill } from 'react-icons/ri';
import { searchTracks } from '../../utils/api';
import { usePlayerStore } from '../../stores/playerStore';
import { TrackCard } from './TrackCard';
import { LoadingSpinner } from '../common/LoadingSpinner';
import type { Track } from '../../types';

export function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { playQueue } = usePlayerStore();

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const tracks = await searchTracks(q.trim());
      setResults(tracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search (200ms for fast feedback)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
      inputRef.current?.blur();
    }
  };

  const handlePlayAll = () => {
    if (results.length > 0) {
      playQueue(results, 0);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Search Bar ── */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="page-title mb-4">Search</h1>
        <div className="relative">
          <RiSearchLine
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Songs, artists, albums..."
            className="search-bar"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setResults([]);
                setHasSearched(false);
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 btn-ghost p-1.5"
            >
              <RiCloseLine size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size={32} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-brand-400 text-sm font-medium mb-2">Something went wrong</p>
            <p className="text-white/40 text-xs">{error}</p>
            <button
              onClick={() => doSearch(query)}
              className="btn-secondary mt-4 text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {!isLoading && !error && results.length > 0 && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-3 mt-2">
              <p className="text-sm text-white/40">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={handlePlayAll}
                className="flex items-center gap-1.5 text-sm text-brand-400 font-medium
                  hover:text-brand-300 transition-colors active:scale-95"
              >
                <RiPlayFill size={16} />
                Play All
              </button>
            </div>

            <div className="space-y-0.5">
              {results.map((track, i) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  index={i}
                  tracks={results}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state — no results */}
        {!isLoading && !error && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-white/30 text-sm">No results found</p>
            <p className="text-white/20 text-xs mt-1">Try a different search term</p>
          </div>
        )}

        {/* Empty state — initial */}
        {!isLoading && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-20">
            <RiSearchLine size={48} className="text-white/10 mb-4" />
            <p className="text-white/30 text-sm">Search for music</p>
            <p className="text-white/20 text-xs mt-1">Find songs, artists, and more</p>
          </div>
        )}
      </div>
    </div>
  );
}
