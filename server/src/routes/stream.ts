/**
 * Stream route — GET /api/stream/:videoId
 * Proxies the audio stream from YouTube to the client with high-performance
 * Node stream piping, backpressure handling, and HTTP 206 Range seeking.
 */

import { Router, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { getStreamUrl } from '../services/youtube.js';
import { streamCache } from '../utils/cache.js';

const router = Router();

interface CachedStream {
  url: string;
  contentType: string;
  headers?: Record<string, string>;
}

function buildProxyHeaders(req: Request, streamInfo?: { headers?: Record<string, string> }): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ...(streamInfo?.headers || {}),
  };
  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }
  return headers;
}

router.get('/:videoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : req.params.videoId?.[0];
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      res.status(400).json({ error: 'Invalid video ID' });
      return;
    }

    // Get stream URL (cached for 4 hours)
    const cacheKey = videoId;
    let streamInfo = streamCache.get(cacheKey) as CachedStream | undefined;

    if (!streamInfo) {
      console.log(`  ↳ Fetching stream URL for: ${videoId}`);
      const result = await getStreamUrl(videoId);
      streamInfo = { url: result.url, contentType: result.contentType, headers: result.headers };
      streamCache.set(cacheKey, streamInfo, 4 * 60 * 60 * 1000);
    } else {
      console.log(`  ↳ Stream cache hit for: ${videoId}`);
    }

    const proxyHeaders = buildProxyHeaders(req, streamInfo);

    // Fetch the audio stream from YouTube
    let upstream = await fetch(streamInfo.url, { headers: proxyHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      // Stream URL might have expired, clear cache and retry once
      streamCache.delete(cacheKey);
      console.log(`  ↳ Stream URL expired for ${videoId}, refreshing...`);

      const retryResult = await getStreamUrl(videoId);
      streamInfo = { url: retryResult.url, contentType: retryResult.contentType, headers: retryResult.headers };
      streamCache.set(cacheKey, streamInfo, 4 * 60 * 60 * 1000);

      const retryProxyHeaders = buildProxyHeaders(req, streamInfo);
      upstream = await fetch(streamInfo.url, { headers: retryProxyHeaders });

      if (!upstream.ok && upstream.status !== 206) {
        res.status(502).json({ error: 'Failed to fetch audio stream' });
        return;
      }
    }

    sendStream(req, upstream, streamInfo.contentType, res);
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({
      error: 'Stream failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

/**
 * Pipe upstream web stream directly to Express response with automatic backpressure.
 */
function sendStream(req: Request, upstream: globalThis.Response, contentType: string, res: Response): void {
  res.status(upstream.status);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const headersToForward = ['content-length', 'content-range', 'content-encoding'];
  for (const header of headersToForward) {
    const value = upstream.headers.get(header);
    if (value) {
      res.setHeader(header, value);
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');

  if (req.method === 'HEAD' || !upstream.body) {
    res.end();
    return;
  }

  // Use Node Readable.fromWeb for automatic backpressure management
  const nodeStream = Readable.fromWeb(upstream.body as any);
  nodeStream.pipe(res);

  res.on('close', () => {
    nodeStream.destroy();
  });
}

export default router;
