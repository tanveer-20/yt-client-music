/**
 * Info & Suggestions routes
 * GET /api/info/:videoId — detailed track info
 * GET /api/suggestions/:videoId — related tracks
 */

import { Router, type Request, type Response } from 'express';
import { getTrackInfo, getSuggestions } from '../services/youtube.js';
import { infoCache } from '../utils/cache.js';

const router = Router();

// GET /api/info/:videoId
router.get('/info/:videoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : req.params.videoId?.[0];
    if (!videoId) {
      res.status(400).json({ error: 'Missing videoId' });
      return;
    }

    const cacheKey = `info:${videoId}`;
    const cached = infoCache.get(cacheKey);
    if (cached) {
      console.log(`  ↳ Info cache hit for: ${videoId}`);
      res.json(cached);
      return;
    }

    console.log(`  ↳ Fetching info for: ${videoId}`);
    const info = await getTrackInfo(videoId);
    infoCache.set(cacheKey, info);

    res.json(info);
  } catch (err) {
    console.error('Info error:', err);
    res.status(500).json({
      error: 'Failed to get track info',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// GET /api/suggestions/:videoId
router.get('/suggestions/:videoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : req.params.videoId?.[0];
    if (!videoId) {
      res.status(400).json({ error: 'Missing videoId' });
      return;
    }

    const cacheKey = `suggestions:${videoId}`;
    const cached = infoCache.get(cacheKey);
    if (cached) {
      console.log(`  ↳ Suggestions cache hit for: ${videoId}`);
      res.json(cached);
      return;
    }

    console.log(`  ↳ Fetching suggestions for: ${videoId}`);
    const suggestions = await getSuggestions(videoId);
    const response = { results: suggestions, videoId };
    infoCache.set(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({
      error: 'Failed to get suggestions',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
