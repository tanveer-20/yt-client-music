/**
 * Vercel Serverless Function — Suggestions / Up Next
 * GET /api/suggestions?id=<videoId>
 */

function parseDurationText(text) {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const videoId = req.query.id || req.query.videoId;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  try {
    const ytRes = await fetch('https://www.youtube.com/youtubei/v1/next', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      }),
    });

    if (!ytRes.ok) {
      return res.status(200).json({ results: [], videoId });
    }

    const data = await ytRes.json();
    const results = [];
    const seenIds = new Set([videoId]);

    const resultsList =
      data.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];

    for (const item of resultsList) {
      const v = item.compactVideoRenderer;
      if (v && v.videoId && !seenIds.has(v.videoId)) {
        seenIds.add(v.videoId);
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown';
        const artist =
          v.shortBylineText?.runs?.[0]?.text ||
          v.longBylineText?.runs?.[0]?.text ||
          'Unknown Artist';

        const thumbs = v.thumbnail?.thumbnails || [];
        const thumbUrl =
          thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
        const durationText = v.lengthText?.simpleText;

        results.push({
          id: v.videoId,
          title,
          artist,
          thumbnail: thumbUrl,
          duration: parseDurationText(durationText),
        });

        if (results.length >= 15) break;
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ results, videoId });
  } catch (err) {
    return res.status(200).json({ results: [], videoId });
  }
}
