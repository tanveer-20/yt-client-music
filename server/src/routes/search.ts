/**
 * Search route — GET /api/search?q=:query&limit=:limit
 */

import { Router, type Request, type Response } from 'express';
import { searchTracks } from '../services/youtube.js';
import { searchCache } from '../utils/cache.js';

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query.q as string)?.trim();
    if (!query) {
      res.status(400).json({ error: 'Missing search query parameter "q"' });
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 30);
    const cacheKey = `${query}:${limit}`;

    // Check cache
    const cached = searchCache.get(cacheKey);
    if (cached) {
      console.log(`  ↳ Cache hit for search: "${query}"`);
      res.json(cached);
      return;
    }

    console.log(`  ↳ Searching YouTube for: "${query}" (limit: ${limit})`);
    const results = await searchTracks(query, limit);

    const response = { results, query };
    searchCache.set(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({
      error: 'Search failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
