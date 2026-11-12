/**
 * Direct stream resolver — mounted at /api/direct.
 *
 * Returns the Google Video URL and request headers without proxying audio.
 * This is useful when the companion extension can add the required Origin,
 * Referer and CORS response headers in the browser.
 */

import { Router, type Request, type Response } from 'express';
import { getStreamUrl } from '../services/youtube.js';

const router = Router();

router.get('/:videoId', async (req: Request, res: Response): Promise<void> => {
  const videoId = String(req.params.videoId || '');
  if (!/^[\w-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'Invalid video ID.' });
    return;
  }

  try {
    const stream = await getStreamUrl(videoId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
      videoId,
      url: stream.url,
      format: stream.format,
      contentType: stream.contentType,
      loudnessDb: stream.loudnessDb,
      headers: stream.headers || {},
      expiresAt: Date.now() + 4 * 60 * 60 * 1000,
    });
  } catch (error) {
    res.status(502).json({
      error: 'Could not resolve a direct stream.',
      message: error instanceof Error ? error.message : undefined,
    });
  }
});

export default router;
