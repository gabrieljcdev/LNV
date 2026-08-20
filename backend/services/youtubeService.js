import fetch from 'node-fetch';
import db from '../db/database.js';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Cache ────────────────────────────────────────────────────────────────────

function getCached(cacheKey) {
  const row = db.prepare('SELECT * FROM youtube_cache WHERE query = ?').get(cacheKey);
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > CACHE_TTL) return null;
  return { youtube_url: row.youtube_url, youtube_title: row.youtube_title, fromCache: true };
}

function setCache(cacheKey, youtube_url, youtube_title) {
  db.prepare('INSERT OR REPLACE INTO youtube_cache (query, youtube_url, youtube_title) VALUES (?, ?, ?)')
    .run(cacheKey, youtube_url || null, youtube_title || null);
}

// ─── oEmbed validation (free, no quota) ──────────────────────────────────────
// Use YouTube oEmbed to check a URL is valid and get its title — no API key needed

async function validateWithOembed(youtubeUrl) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch { return null; }
}

// ─── Title matching ───────────────────────────────────────────────────────────

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function matchScore(videoTitle, trackTitle, artist) {
  const vt = normalize(videoTitle);
  const tt = normalize(trackTitle);
  const ar = normalize(artist);
  let score = 0;
  if (vt.includes(tt)) score += 50;
  else {
    const words = tt.split(' ').filter(w => w.length > 2);
    const matched = words.filter(w => vt.includes(w));
    if (words.length > 0 && matched.length / words.length >= 0.7) score += 30;
  }
  if (vt.includes(ar)) score += 20;
  if (/live|remix|cover|karaoke|tribute/.test(vt)) score -= 20;
  return score;
}

// ─── Main: match track to Discogs video using title similarity ────────────────

/**
 * Find YouTube link for a track.
 * Priority: Discogs videos[] matched by title (free) → oEmbed validation → cache miss
 * YouTube Data API is NOT used — zero quota cost.
 */
export async function findYouTubeLink(artist, trackTitle, { catalogNumber = '', label = '', discogsVideos = [] } = {}) {
  const cacheKey = `${artist}|${trackTitle}|${catalogNumber}`.toLowerCase();

  // 1. Cache hit
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // 2. Match against Discogs videos[] by title similarity (free)
  if (discogsVideos.length > 0) {
    let best = null;
    let bestScore = -Infinity;
    for (const v of discogsVideos) {
      const url = v.url || v.uri || '';
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) continue;
      const score = matchScore(v.title || '', trackTitle, artist);
      if (score > bestScore) { bestScore = score; best = v; }
    }
    if (best && bestScore >= 30) {
      const videoId = best.url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
      if (videoId) {
        const youtube_url = `https://www.youtube.com/watch?v=${videoId}`;
        setCache(cacheKey, youtube_url, best.title || trackTitle);
        return { youtube_url, youtube_title: best.title || trackTitle };
      }
    }
  }

  // 3. No match found — cache the miss so we don't retry
  setCache(cacheKey, null, null);
  return { youtube_url: null, youtube_title: null };
}

/**
 * Enrich all tracks on a post with YouTube links using Discogs videos[]
 */
export async function enrichPostTracks(postId) {
  const tracks = db.prepare('SELECT * FROM post_tracks WHERE post_id = ?').all(postId);
  const artists = db.prepare('SELECT artist_name FROM post_artists WHERE post_id = ?').all(postId);
  const labels = db.prepare('SELECT label_name, catalogue_number FROM post_labels WHERE post_id = ?').all(postId);

  const artistName = artists[0]?.artist_name || '';
  const catalogNumber = labels[0]?.catalogue_number || '';
  const labelName = labels[0]?.label_name || '';

  const results = [];
  for (const track of tracks) {
    if (track.youtube_url || track.stream_url) {
      results.push({ ...track, fromCache: true });
      continue;
    }
    try {
      const { youtube_url, youtube_title } = await findYouTubeLink(artistName, track.title, {
        catalogNumber, label: labelName,
      });
      if (youtube_url) {
        db.prepare('UPDATE post_tracks SET youtube_url = ?, stream_url = ? WHERE id = ?')
          .run(youtube_url, youtube_url, track.id);
      }
      results.push({ ...track, youtube_url, youtube_title });
    } catch (e) {
      console.warn(`YT enrich failed for track "${track.title}":`, e.message);
      results.push({ ...track, youtube_url: null });
    }
  }
  return results;
}
