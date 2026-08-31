/**
 * Stream route — GET /api/stream/:videoId
 * Proxies the audio stream from YouTube to the client.
 * Supports Range requests for seeking.
 */

import { Router, type Request, type Response } from 'express';
import { getStreamUrl } from '../services/youtube.js';
import { streamCache } from '../utils/cache.js';

const router = Router();

interface CachedStream {
  url: string;
  contentType: string;
  headers?: Record<string, string>;
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
      streamCache.set(cacheKey, streamInfo, 4 * 60 * 60 * 1000); // 4 hours
    } else {
      console.log(`  ↳ Stream cache hit for: ${videoId}`);
    }

    // Build headers for the proxy request
    const proxyHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(streamInfo.headers || {}),
    };

    // Forward Range header for seeking
    if (req.headers.range) {
      proxyHeaders['Range'] = req.headers.range;
    }

    // Fetch the audio stream from YouTube
    const upstream = await fetch(streamInfo.url, { headers: proxyHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      // Stream URL might have expired, clear cache and retry once
      streamCache.delete(cacheKey);
      console.log(`  ↳ Stream URL expired for ${videoId}, retrying...`);

      const retryResult = await getStreamUrl(videoId);
      streamInfo = { url: retryResult.url, contentType: retryResult.contentType, headers: retryResult.headers };
      streamCache.set(cacheKey, streamInfo, 4 * 60 * 60 * 1000);

      const retryProxyHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(retryResult.headers || {}),
      };
      if (req.headers.range) {
        retryProxyHeaders['Range'] = req.headers.range;
      }

      const retryUpstream = await fetch(streamInfo.url, { headers: retryProxyHeaders });
      if (!retryUpstream.ok && retryUpstream.status !== 206) {
        res.status(502).json({ error: 'Failed to fetch audio stream' });
        return;
      }

      sendStream(req, retryUpstream, streamInfo.contentType, res);
      return;
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
 * Pipe an upstream fetch Response into the Express response with proper headers.
 */
function sendStream(req: Request, upstream: globalThis.Response, contentType: string, res: Response): void {
  // Set response status (200 or 206 for partial content)
  res.status(upstream.status);

  // Set headers
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  // Forward relevant headers from upstream
  const headersToForward = ['content-length', 'content-range', 'content-encoding'];
  for (const header of headersToForward) {
    const value = upstream.headers.get(header);
    if (value) {
      res.setHeader(header, value);
    }
  }

  // CORS headers for audio playback
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  // Pipe the stream
  if (upstream.body) {
    const reader = upstream.body.getReader();

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          if (!res.writableEnded) {
            res.write(Buffer.from(value));
          } else {
            reader.cancel();
            break;
          }
        }
      } catch (err) {
        if (!res.writableEnded) {
          res.end();
        }
      }
    };

    // Handle client disconnect
    res.on('close', () => {
      reader.cancel().catch(() => {});
    });

    pump();
  } else {
    res.end();
  }
}

export default router;
