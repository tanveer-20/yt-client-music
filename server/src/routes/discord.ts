/**
 * Discord rich-presence routes — mounted at /api/discord.
 *
 *   GET  /status
 *   POST /connect     { token, clientId? }
 *   POST /activity    { title, artist, album?, artwork?, startedAt?, paused? }
 *   POST /disconnect
 *
 * Tokens are held in memory by the service and are never echoed or logged.
 */

import { Router, type Request, type Response } from 'express';
import {
  connect,
  disconnect,
  getStatus,
  setActivity,
} from '../services/discord.js';

const router = Router();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Discord request failed.';
}

router.get('/status', (_req: Request, res: Response): void => {
  res.json(getStatus());
});

router.post('/connect', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { token?: unknown; clientId?: unknown };
  const token = typeof body.token === 'string' ? body.token : '';
  const clientId = typeof body.clientId === 'string' ? body.clientId : undefined;

  if (!token.trim()) {
    res.status(400).json({ error: 'Paste a Discord user token.' });
    return;
  }

  try {
    res.json(await connect(token, clientId));
  } catch (error) {
    const message = messageOf(error);
    const status = /token|auth|4004|4014/i.test(message) ? 401 : 502;
    res.status(status).json({ error: message });
  }
});

router.post('/activity', (req: Request, res: Response): void => {
  const body = (req.body ?? {}) as {
    title?: unknown;
    artist?: unknown;
    album?: unknown;
    artwork?: unknown;
    startedAt?: unknown;
    paused?: unknown;
  };

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'Activity title is required.' });
    return;
  }

  try {
    const status = setActivity({
      title,
      artist: typeof body.artist === 'string' ? body.artist : '',
      album: typeof body.album === 'string' ? body.album : undefined,
      artwork: typeof body.artwork === 'string' ? body.artwork : undefined,
      startedAt:
        typeof body.startedAt === 'number' && Number.isFinite(body.startedAt)
          ? body.startedAt
          : undefined,
      paused: body.paused === true,
    });
    res.json(status);
  } catch (error) {
    const message = messageOf(error);
    const status = /not connected/i.test(message) ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

router.post('/disconnect', (_req: Request, res: Response): void => {
  res.json(disconnect());
});

export default router;
