/**
 * Addon routes — mounted at /api/addons.
 *
 *   GET    /               configured addons
 *   POST   /               { url }
 *   PATCH  /:id            { enabled?, order? }
 *   DELETE /:id
 *   POST   /:id/refresh
 *   GET    /search?q=      aggregated addon results
 *   GET    /stream/:addonId/:trackId — ranged audio proxy
 */

import { Router, type Request, type Response } from 'express';
import {
  AddonError,
  addAddon,
  findAddon,
  listAddons,
  refreshAddon,
  removeAddon,
  resolveAddonStream,
  searchAddons,
  searchManifests,
  updateAddon,
  validateBaseUrl,
} from '../services/addons.js';

const router = Router();

function sendError(res: Response, error: unknown): void {
  const status = error instanceof AddonError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Addon request failed.';
  res.status(status).json({ error: message });
}

router.get('/', (_req: Request, res: Response): void => {
  res.json({ addons: listAddons() });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const url = typeof (req.body as { url?: unknown })?.url === 'string' ? String(req.body.url) : '';
  if (!url.trim()) {
    res.status(400).json({ error: 'Paste the addon base URL.' });
    return;
  }
  try {
    const base = validateBaseUrl(url);
    await searchManifests(base);
    res.json(await addAddon(url));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:id', (req: Request, res: Response): void => {
  const body = (req.body ?? {}) as { enabled?: unknown; order?: unknown };
  try {
    res.json(
      updateAddon(String(req.params.id), {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        order: typeof body.order === 'number' ? body.order : undefined,
      })
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    removeAddon(String(req.params.id));
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await refreshAddon(String(req.params.id)));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    res.status(400).json({ error: 'Missing search query parameter "q".' });
    return;
  }
  try {
    res.json({ query, tracks: await searchAddons(query) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/stream/:addonId/:trackId', async (req: Request, res: Response): Promise<void> => {
  try {
    const addon = findAddon(String(req.params.addonId));
    const trackId = String(req.params.trackId);
    const upstream = await resolveAddonStream(addon, trackId);

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const contentType = upstream.headers.get('content-type') || '';
    if (!/text\/html/i.test(contentType)) res.setHeader('Cache-Control', 'public, max-age=600');

    for (const header of ['content-length', 'content-range'] as const) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }

    if (!upstream.body) {
      res.end();
      return;
    }
    const nodeStream = await import('node:stream').then(({ Readable }) => Readable.fromWeb(upstream.body as never));
    nodeStream.pipe(res);
    res.on('close', () => nodeStream.destroy());
  } catch (error) {
    if (!res.headersSent) sendError(res, error);
  }
});

export default router;
