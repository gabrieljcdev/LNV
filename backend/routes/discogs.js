import express from 'express';
import { searchDiscogs, getRelease, getMaster } from '../services/discogsService.js';
import db from '../db/database.js';

const router = express.Router();

// Generate multiple search query variations in order of confidence
function buildSearchQueries(artist, title, label, catno) {
  const queries = [];

  // Most specific first
  queries.push(`${artist} ${title}`);
  queries.push(`${artist} - ${title}`);
  queries.push(`"${title}" ${artist}`);

  // With label — label channels often have official uploads
  if (label) {
    queries.push(`${artist} ${title} ${label}`);
  }

  // With catalogue number — very specific, finds the exact pressing
  if (catno) {
    queries.push(`${title} ${catno}`);
  }

  // Broader fallbacks
  queries.push(`${title} ${artist} official`);
  queries.push(`${title} ${artist} audio`);

  return queries;
}

// Score a YouTube result based on how well it matches
function scoreResult(item, artist, title) {
  const videoTitle = (item.snippet?.title || '').toLowerCase();
  const channelTitle = (item.snippet?.channelTitle || '').toLowerCase();
  const artistLower = artist.toLowerCase();
  const titleLower = title.toLowerCase();

  let score = 0;

  // Positive signals
  if (videoTitle.includes(titleLower))  score += 4;  // title match is most important
  if (videoTitle.includes(artistLower)) score += 3;  // artist name present
  if (channelTitle.includes(artistLower)) score += 2; // official artist channel
  if (videoTitle.includes('official'))  score += 1;
  if (videoTitle.includes('audio'))     score += 1;

  // Negative signals — penalise bad matches
  if (videoTitle.includes('full album'))  score -= 5;
  if (videoTitle.includes('mix'))         score -= 3;
  if (videoTitle.includes('cover'))       score -= 4;
  if (videoTitle.includes('remix') && !titleLower.includes('remix')) score -= 3;
  if (videoTitle.includes('live') && !titleLower.includes('live'))   score -= 2;
  if (videoTitle.includes('tribute'))    score -= 5;
  if (videoTitle.includes('karaoke'))    score -= 10;

  return score;
}

// Validate a YouTube video still exists using oEmbed
async function validateYouTubeVideo(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    return res.ok;
  } catch {
    return false;
  }
}

// GET /api/discogs/search?q=pink+floyd&type=release&page=1
router.get('/search', async (req, res, next) => {
  try {
    const { q, type = 'release', page = 1 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const results = await searchDiscogs(q, type, Number(page));
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/release/:id
router.get('/release/:id', async (req, res, next) => {
  try {
    const release = await getRelease(Number(req.params.id));
    res.json(release);
  } catch (err) {
    next(err);
  }
});

// GET /api/discogs/master/:id
router.get('/master/:id', async (req, res, next) => {
  try {
    const master = await getMaster(Number(req.params.id));
    res.json(master);
  } catch (err) {
    next(err);
  }
});

router.get('/youtube/search', async (req, res, next) => {
  try {
    const { artist, title, catno, label } = req.query;
    if (!artist || !title) return res.status(400).json({ error: 'artist and title required' });

    // Check cache first — including cached misses
    const cacheKey = `${artist.toLowerCase()}|||${title.toLowerCase()}`;
    const cached = db.prepare(
      'SELECT * FROM youtube_cache WHERE query = ?'
    ).get(cacheKey);

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (age < sevenDays) {
        return res.json({ youtube_url: cached.youtube_url || null });
      }
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'No YouTube API key configured' });

    // Generate multiple search query variations
    const queries = buildSearchQueries(artist, title, label, catno);
    
    let bestResult = null;
    let bestScore = -1;

    for (const query of queries) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=3&key=${apiKey}`;
        const ytRes = await fetch(url);
        const data = await ytRes.json();
        // If quota exceeded, bail out of all queries immediately
        if (data.error?.errors?.[0]?.reason === 'quotaExceeded') break;
        if (!ytRes.ok) continue;
        if (!data.items || data.items.length === 0) continue;

        // Score each result and keep the best
        for (const item of data.items) {
          const score = scoreResult(item, artist, title);
          if (score > bestScore) {
            bestScore = score;
            bestResult = item;
          }
        }

        // If we found a high confidence result stop searching
        if (bestScore >= 8) break;

      } catch {
        continue;
      }
    }

    // Validate the best result still exists on YouTube
    let youtube_url = null;
    if (bestResult && bestScore >= 0) {
      const videoId = bestResult.id.videoId;
      const isValid = await validateYouTubeVideo(videoId);
      if (isValid) {
        youtube_url = `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    // Cache the result (including misses — youtube_url will be null)
    db.prepare(
      'INSERT OR REPLACE INTO youtube_cache (query, youtube_url) VALUES (?, ?)'
    ).run(cacheKey, youtube_url);

    res.json({ youtube_url });

  } catch (err) {
    next(err);
  }
});
export default router;
