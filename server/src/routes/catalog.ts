/**
 * Catalog routes — YouTube Music browse metadata and lyrics.
 *
 *   GET /api/home
 *   GET /api/album/:id
 *   GET /api/artist/:id
 *   GET /api/playlist/:id
 *   GET /api/lyrics?videoId=&title=&artist=&album=&duration=
 */

import { Router, type Request, type Response } from 'express';
import {
  getAlbum,
  getArtist,
  getHome,
  getLyrics,
  getPlaylist,
} from '../services/catalog.js';

const router = Router();

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

router.get('/home', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getHome());
  } catch (error) {
    console.error('Home error:', error);
    res.status(502).json({
      error: 'Could not load the home feed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/album/:id', async (req: Request, res: Response): Promise<void> => {
  const id = param(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing album id' });
    return;
  }
  try {
    res.json(await getAlbum(id));
  } catch (error) {
    console.error('Album error:', error);
    res.status(502).json({
      error: 'Could not load this album',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/artist/:id', async (req: Request, res: Response): Promise<void> => {
  const id = param(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing artist id' });
    return;
  }
  try {
    res.json(await getArtist(id));
  } catch (error) {
    console.error('Artist error:', error);
    res.status(502).json({
      error: 'Could not load this artist',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/playlist/:id', async (req: Request, res: Response): Promise<void> => {
  const id = param(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing playlist id' });
    return;
  }
  try {
    res.json(await getPlaylist(id));
  } catch (error) {
    console.error('Playlist error:', error);
    res.status(502).json({
      error: 'Could not load this playlist',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/lyrics', async (req: Request, res: Response): Promise<void> => {
  const videoId = String(req.query.videoId || '').trim();
  const title = String(req.query.title || '').trim();
  const artist = String(req.query.artist || '').trim();

  if (!videoId || !title || !artist) {
    res.status(400).json({ error: 'videoId, title and artist are required' });
    return;
  }

  try {
    const lyrics = await getLyrics({
      videoId,
      title,
      artist,
      album: String(req.query.album || '').trim() || undefined,
      duration: Number(req.query.duration) || undefined,
    });
    res.json(lyrics);
  } catch (error) {
    console.error('Lyrics error:', error);
    res.status(502).json({
      error: 'Could not load lyrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
