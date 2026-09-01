/**
 * YT Music Server — Express API for YouTube audio streaming.
 *
 * Routes:
 *   GET /api/health             — health check
 *   GET /api/search?q=&limit=   — search YouTube
 *   GET /api/stream/:videoId    — proxy audio stream
 *   GET /api/info/:videoId      — track details
 *   GET /api/suggestions/:videoId — related tracks
 */

import express from 'express';
import cors from 'cors';
import searchRouter from './routes/search.js';
import streamRouter from './routes/stream.js';
import infoRouter from './routes/info.js';
import { checkYtDlp } from './services/youtube.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// ─── Middleware ───────────────────────────────────────────────

app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Range', 'Content-Type'],
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
}));

app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ──────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/search', searchRouter);
app.use('/api/stream', streamRouter);
app.use('/api', infoRouter);  // handles /api/info/:id and /api/suggestions/:id

// ─── Error Handling ──────────────────────────────────────────

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

import os from 'node:os';

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

async function start() {
  // Check yt-dlp availability
  const ytdlp = await checkYtDlp();
  if (ytdlp.installed) {
    console.log(`✓ yt-dlp found (version ${ytdlp.version})`);
  } else {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════╗');
    console.error('║  ⚠  yt-dlp is NOT installed or not in PATH!            ║');
    console.error('║                                                        ║');
    console.error('║  Install it:                                           ║');
    console.error('║    pip install yt-dlp                                  ║');
    console.error('║  or download from:                                     ║');
    console.error('║    https://github.com/yt-dlp/yt-dlp/releases          ║');
    console.error('╚══════════════════════════════════════════════════════════╝');
    console.error('');
  }

  app.listen(PORT, '0.0.0.0', () => {
    const localIps = getLocalIpAddresses();
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  🎵  YT Music Streaming Server Running                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  💻 PC / Localhost:    http://localhost:${PORT}`);
    if (localIps.length > 0) {
      console.log('');
      console.log('  📱 Phone APK Connection URLs (Enter in Settings):');
      for (const ip of localIps) {
        console.log(`     👉 http://${ip}:${PORT}`);
      }
    }
    console.log('');
    console.log('  Endpoints:');
    console.log(`    GET /api/health`);
    console.log(`    GET /api/search?q=<query>&limit=<n>`);
    console.log(`    GET /api/stream/<videoId>`);
    console.log(`    GET /api/info/<videoId>`);
    console.log(`    GET /api/suggestions/<videoId>`);
    console.log('');
  });
}

start();
