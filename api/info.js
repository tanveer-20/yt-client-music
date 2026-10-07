/**
 * Vercel Serverless Function — Track Info
 * GET /api/info?id=<videoId>
 */

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
    // 1. Fetch fast oEmbed metadata
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);

    if (oembedRes.ok) {
      const data = await oembedRes.json();
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).json({
        id: videoId,
        title: data.title || 'YouTube Track',
        artist: data.author_name || 'Unknown Artist',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: 0,
      });
    }

    // Fallback minimal info
    return res.status(200).json({
      id: videoId,
      title: 'YouTube Track',
      artist: 'Unknown Artist',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
    });
  } catch (err) {
    return res.status(200).json({
      id: videoId,
      title: 'YouTube Track',
      artist: 'Unknown Artist',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
    });
  }
}
