/**
 * Search route — GET /api/search?q=:query
 *
 * Returns the full search surface (songs, albums, artists, playlists,
 * videos) from YouTube Music. The legacy yt-dlp/InnerTube track search
 * remains as a fallback when the music catalogue call fails.
 */

import { Router, type Request, type Response } from 'express';
import { searchMusic, type SearchResults } from '../services/catalog.js';
import { searchTracks } from '../services/youtube.js';
import { searchCache } from '../utils/cache.js';

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    res.status(400).json({ error: 'Missing search query parameter "q"' });
    return;
  }

  const cacheKey = `v2:${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey) as SearchResults | undefined;
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const results = await searchMusic(query);
    searchCache.set(cacheKey, results, 5 * 60 * 1000);
    res.json(results);
    return;
  } catch (error) {
    console.warn('Music search failed, falling back to track search:', error);
  }

  try {
    const tracks = await searchTracks(query, 20);
    const fallback: SearchResults = {
      query,
      top: tracks[0]
        ? {
            id: tracks[0].id,
            kind: 'track',
            title: tracks[0].title,
            subtitle: tracks[0].artist,
            artwork: tracks[0].thumbnail,
            duration: tracks[0].duration,
          }
        : undefined,
      songs: tracks,
      albums: [],
      artists: [],
      playlists: [],
      videos: [],
    };
    searchCache.set(cacheKey, fallback, 2 * 60 * 1000);
    res.json(fallback);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
