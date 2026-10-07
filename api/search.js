/**
 * Vercel Serverless Function — Search YouTube Music & YouTube
 * GET /api/search?q=<query>&limit=<n>
 */

function parseDurationText(text) {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return 0;
}

async function searchYouTubeMusic(query, limit = 25) {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Referer: 'https://music.youtube.com/',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const sections =
      data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    const tracks = [];
    const seen = new Set();

    function addTrack(title, artist, videoId, thumbs, durationStr) {
      if (!videoId || seen.has(videoId)) return;
      seen.add(videoId);

      let thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      if (thumbs && thumbs.length > 0) {
        thumbUrl = thumbs[thumbs.length - 1].url.replace(/=w\d+-h\d+/, '=w544-h544');
      }

      tracks.push({
        id: videoId,
        title: title || 'Unknown',
        artist: artist || 'Unknown Artist',
        thumbnail: thumbUrl,
        duration: parseDurationText(durationStr),
      });
    }

    for (const s of sections) {
      if (s.musicCardShelfRenderer) {
        const card = s.musicCardShelfRenderer;
        const title = card.title?.runs?.[0]?.text;
        const artist = card.subtitle?.runs?.[0]?.text;
        const videoId =
          card.onTap?.watchEndpoint?.videoId ||
          card.buttons?.[0]?.buttonRenderer?.command?.watchEndpoint?.videoId;
        const thumbs = card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
        addTrack(title, artist, videoId, thumbs);
      }

      const shelfItems = s.musicShelfRenderer?.contents || s.itemSectionRenderer?.contents || [];
      for (const item of shelfItems) {
        const r = item.musicResponsiveListItemRenderer;
        if (r) {
          const videoId =
            r.playlistItemData?.videoId ||
            r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
            r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const runs = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          const artist =
            runs
              .map((x) => x.text)
              .filter((t) => t && t !== ' • ' && !t.includes(':') && t !== 'Song' && t !== 'Album' && t !== 'Video')
              .join(', ') || 'Unknown Artist';

          const durationRun = runs.find((x) => /^\d+:\d+$/.test(x.text));
          const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;

          addTrack(title, artist, videoId, thumbs, durationRun?.text);
          if (tracks.length >= limit) return tracks;
        }
      }
    }

    return tracks;
  } catch (err) {
    return [];
  }
}

async function searchYouTubeWeb(query, limit = 25) {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
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
        query,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const sections =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ||
      data.contents?.sectionListRenderer?.contents ||
      [];

    const tracks = [];
    const seenIds = new Set();

    function extractItem(item) {
      const v = item.videoRenderer || item.compactVideoRenderer;
      if (v && v.videoId && !seenIds.has(v.videoId)) {
        seenIds.add(v.videoId);
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown';
        const artist =
          v.ownerText?.runs?.[0]?.text ||
          v.longBylineText?.runs?.[0]?.text ||
          v.shortBylineText?.runs?.[0]?.text ||
          'Unknown Artist';

        const thumbs = v.thumbnail?.thumbnails || [];
        const thumbUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
        const durationText = v.lengthText?.simpleText || v.lengthText?.accessibility?.accessibilityData?.label;
        const duration = parseDurationText(durationText);

        tracks.push({
          id: v.videoId,
          title,
          artist,
          thumbnail: thumbUrl,
          duration,
        });
      }

      if (item.shelfRenderer) {
        const shelfItems =
          item.shelfRenderer.content?.verticalListRenderer?.items ||
          item.shelfRenderer.content?.expandedShelfContentsRenderer?.items ||
          [];
        for (const si of shelfItems) {
          extractItem(si);
          if (tracks.length >= limit) return;
        }
      }
    }

    for (const section of sections) {
      const items = section.itemSectionRenderer?.contents || [];
      for (const item of items) {
        extractItem(item);
        if (tracks.length >= limit) return tracks;
      }
    }

    return tracks;
  } catch (err) {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query.q;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '25', 10)));

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    let results = await searchYouTubeMusic(query.trim(), limit);
    if (!results || results.length === 0) {
      results = await searchYouTubeWeb(query.trim(), limit);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: 'Search failed', message: err.message });
  }
}
