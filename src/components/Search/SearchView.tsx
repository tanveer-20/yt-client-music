/**
 * SearchView — iOS-style search with debounced input and results.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { RiSearchLine, RiCloseLine, RiPlayFill, RiServerLine, RiSettings3Line } from 'react-icons/ri';
import { searchTracks } from '../../utils/api';
import { usePlayerStore } from '../../stores/playerStore';
import { useUIStore } from '../../stores/uiStore';
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const { playQueue } = usePlayerStore();
  const { setView } = useUIStore();

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const tracks = await searchTracks(q.trim(), 40, controller.signal);
      setResults(tracks);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
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
      {/* ── Search Bar Header (with safe top padding) ── */}
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-2">
        <h1 className="page-title mb-3">Search</h1>
        <div className="relative">
          <RiSearchLine
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Songs, artists, albums..."
            className="search-bar text-sm sm:text-base py-3"
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
      <div className="flex-1 overflow-y-auto px-4 safe-scroll-bottom">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size={32} />
          </div>
        )}

        {/* Error State with Helper */}
        {error && (
          <div className="flex flex-col items-center justify-center py-12 px-4 max-w-sm mx-auto text-center animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center mb-4">
              <RiSearchLine size={28} />
            </div>
            <p className="text-white text-base font-semibold mb-1">Search Unavailable</p>
            <p className="text-white/50 text-xs mb-6 leading-relaxed">
              {error.includes('connect') || error.includes('network')
                ? 'Please check your internet connection (Wi-Fi or Mobile Data) and try again.'
                : error}
            </p>
            <button
              onClick={() => doSearch(query)}
              className="btn-primary text-xs sm:text-sm py-2.5 px-6"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {!isLoading && !error && results.length > 0 && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-3 mt-2">
              <p className="text-xs sm:text-sm text-white/40 font-medium">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={handlePlayAll}
                className="flex items-center gap-1.5 text-xs sm:text-sm text-brand-400 font-semibold
                  hover:text-brand-300 transition-colors active:scale-95 px-2 py-1 rounded-lg bg-brand-500/10"
              >
                <RiPlayFill size={16} />
                Play All
              </button>
            </div>

            <div className="space-y-1">
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
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-white/40 text-sm font-medium">No results found</p>
            <p className="text-white/25 text-xs mt-1">Try a different search term</p>
          </div>
        )}

        {/* Empty state — initial */}
        {!isLoading && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <RiSearchLine size={48} className="text-white/10 mb-4" />
            <p className="text-white/40 text-sm font-medium">Search for music</p>
            <p className="text-white/20 text-xs mt-1">Find songs, artists, and albums</p>
          </div>
        )}
      </div>
    </div>
  );
}
