/**
 * Listen Together REST routes — mounted at /api/party.
 *
 *   POST   /        create room
 *   GET    /:code   public summary
 *   DELETE /:code   host-only close (Bearer room token)
 *   GET    /health
 */

import { Router, type Request, type Response } from 'express';
import { closeRoom, createRoom, getRoomSummary, roomCount } from '../services/party.js';

const router = Router();

router.get('/health', (_req: Request, res: Response): void => {
  res.json({ ok: true, rooms: roomCount() });
});

router.post('/', (req: Request, res: Response): void => {
  const body = (req.body ?? {}) as { name?: unknown; hostName?: unknown };
  res.json(createRoom(body));
});

router.get('/:code', (req: Request, res: Response): void => {
  const summary = getRoomSummary(String(req.params.code));
  if (!summary) {
    res.status(404).json({ error: 'This Listen Together room does not exist.' });
    return;
  }
  res.json(summary);
});

router.delete('/:code', (req: Request, res: Response): void => {
  try {
    const auth = req.headers.authorization || '';
    res.json(closeRoom(String(req.params.code), auth.replace(/^Bearer\s+/i, '')));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not close the room.';
    const status = /Only the host/i.test(message) ? 403 : 404;
    res.status(status).json({ error: message });
  }
});

export default router;
