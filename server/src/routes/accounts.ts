/**
 * Account routes — mounted at /api/accounts.
 *
 *   GET    /status
 *   POST   /session  { cookies, source? }
 *   DELETE /session
 *   GET    /library  (501 until signed-in browsing is enabled)
 */

import { Router, type Request, type Response } from 'express';
import {
  connectAccount,
  disconnectAccount,
  getAccountStatus,
} from '../services/accounts.js';

const router = Router();

router.get('/status', (_req: Request, res: Response): void => {
  res.json(getAccountStatus());
});

router.post('/session', (req: Request, res: Response): void => {
  const body = (req.body ?? {}) as { cookies?: unknown; source?: unknown };
  try {
    res.json(connectAccount(body));
  } catch (error) {
    const status = typeof (error as { status?: number }).status === 'number' ? Number((error as { status?: number }).status) : 400;
    res.status(status).json({ error: error instanceof Error ? error.message : 'Could not connect the account.' });
  }
});

router.delete('/session', (_req: Request, res: Response): void => {
  res.json(disconnectAccount());
});

router.get('/library', (_req: Request, res: Response): void => {
  res.status(501).json({
    error: 'Signed-in YouTube library browsing is not enabled yet.',
  });
});

export default router;
