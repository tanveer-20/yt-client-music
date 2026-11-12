/**
 * Spotify routes — mounted at /api/spotify.
 *
 *   GET    /status
 *   POST   /session          { spDc }
 *   DELETE /session
 *   GET    /playlist/:id
 *   POST   /import           { playlistUrl | playlistId, limit? }
 *
 * The sp_dc cookie and minted access token never leave the server process.
 */

import { Router, type Request, type Response } from 'express';
import {
  SpotifyError,
  connectSpotify,
  disconnectSpotify,
  getSpotifyPlaylist,
  getSpotifyStatus,
  importSpotifyPlaylist,
} from '../services/spotify.js';

const router = Router();

function sendError(res: Response, error: unknown): void {
  const status = error instanceof SpotifyError ? error.status : 502;
  const message = error instanceof Error ? error.message : 'Spotify request failed.';
  res.status(status).json({ error: message });
}

function playlistIdParam(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] || '' : value || '';
}

router.get('/status', (_req: Request, res: Response): void => {
  res.json(getSpotifyStatus());
});

router.post('/session', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { spDc?: unknown };
  const spDc = typeof body.spDc === 'string' ? body.spDc : '';

  if (!spDc.trim()) {
    res.status(400).json({ error: 'Paste the sp_dc cookie value from open.spotify.com.' });
    return;
  }

  try {
    res.json(await connectSpotify(spDc));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/session', (_req: Request, res: Response): void => {
  res.json(disconnectSpotify());
});

router.get('/playlist/:id', async (req: Request, res: Response): Promise<void> => {
  const id = playlistIdParam(req);
  if (!id) {
    res.status(400).json({ error: 'Missing Spotify playlist id.' });
    return;
  }

  try {
    res.json(await getSpotifyPlaylist(id));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/import', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as {
    playlistUrl?: unknown;
    playlistId?: unknown;
    limit?: unknown;
  };

  const playlistUrl = typeof body.playlistUrl === 'string' ? body.playlistUrl : undefined;
  const playlistId = typeof body.playlistId === 'string' ? body.playlistId : undefined;
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : undefined;

  if (!playlistUrl?.trim() && !playlistId?.trim()) {
    res.status(400).json({ error: 'Paste a Spotify playlist link or ID to import.' });
    return;
  }

  try {
    res.json(await importSpotifyPlaylist({ playlistUrl, playlistId, limit }));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
