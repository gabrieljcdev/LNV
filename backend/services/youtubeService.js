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

// ─── Channel catalogue ────────────────────────────────────────────────────────
// The channel spotlight's equivalent of an artist's or a label's Discogs
// discography: everything that channel has uploaded, so a Boiler Room / HÖR /
// fabric spotlight can show its back catalogue and flag which sets are already
// in the feed. Channels are not a Discogs entity (see subjectDiscogsId in
// Feed.jsx), so this is the one of the three catalogue sources that comes from
// YouTube rather than Discogs.
//
// Resolved from a VIDEO the channel actually published, not from the channel's
// display name: posts only store `channel` as a free-text label ("HÖR"), and
// search.list-by-name costs 100 quota units AND guesses. Going video -> channel
// -> uploads playlist is exact and costs 3 units total, cached for a day.
//
// Shape deliberately mirrors discogsService's getArtistReleases/getLabelReleases
// ({ releases: [{ id, title, year, thumb }], pagination: { items } }) so
// SpotlightCard can render all three subject types through one code path.

const CHANNEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day — channels keep uploading

function getChannelCached(key) {
  try {
    const row = db.prepare('SELECT * FROM youtube_channel_cache WHERE cache_key = ?').get(key);
    if (!row) return null;
    if (Date.now() - new Date(row.fetched_at).getTime() > CHANNEL_CACHE_TTL) return null;
    return JSON.parse(row.data);
  } catch { return null; }
}

function setChannelCache(key, data) {
  try {
    db.prepare('INSERT OR REPLACE INTO youtube_channel_cache (cache_key, data, fetched_at) VALUES (?, ?, datetime(\'now\'))')
      .run(key, JSON.stringify(data));
  } catch { /* ignore cache write errors */ }
}

async function ytApi(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not set');
  const qs = new URLSearchParams({ ...params, key }).toString();
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `YouTube ${path} failed: ${res.status}`);
  }
  return data;
}

export function extractVideoId(url) {
  return (url || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] || null;
}

/**
 * Uploads for the channel that published `videoId`.
 * Returns { channel: { id, title, thumb }, releases: [...], pagination: { items } }.
 */
export async function getChannelUploads(videoId, limit = 24) {
  const max = Math.min(Math.max(Number(limit) || 24, 1), 50); // playlistItems caps at 50
  const cacheKey = `channel-uploads:${videoId}:${max}`;
  const cached = getChannelCached(cacheKey);
  if (cached) return cached;

  // 1 unit — the video tells us which channel it belongs to, exactly.
  const vid = await ytApi('videos', { part: 'snippet', id: videoId });
  const snippet = vid.items?.[0]?.snippet;
  if (!snippet) throw new Error(`Video ${videoId} not found`);
  const channelId = snippet.channelId;

  // 1 unit — every channel has an auto-maintained "uploads" playlist.
  const ch = await ytApi('channels', { part: 'contentDetails,snippet', id: channelId });
  const chItem = ch.items?.[0];
  const uploadsId = chItem?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error(`No uploads playlist for channel ${channelId}`);

  // 1 unit — newest first, which is what playlistItems returns for uploads.
  const pl = await ytApi('playlistItems', { part: 'snippet,contentDetails', playlistId: uploadsId, maxResults: String(max) });

  const releases = (pl.items || []).map(it => {
    const s = it.snippet || {};
    const publishedAt = it.contentDetails?.videoPublishedAt || s.publishedAt || '';
    return {
      // `id` is the VIDEO id (a string), not a Discogs numeric id — the
      // frontend keys and on-site matching both treat it as opaque.
      id: it.contentDetails?.videoId || s.resourceId?.videoId || null,
      title: s.title || '',
      year: publishedAt ? Number(publishedAt.substring(0, 4)) : null,
      thumb: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || null,
      url: (it.contentDetails?.videoId || s.resourceId?.videoId)
        ? `https://www.youtube.com/watch?v=${it.contentDetails?.videoId || s.resourceId?.videoId}`
        : null,
    };
  }).filter(r => r.id);

  const out = {
    channel: {
      id: channelId,
      title: chItem?.snippet?.title || snippet.channelTitle || '',
      thumb: chItem?.snippet?.thumbnails?.default?.url || null,
    },
    releases,
    // Total uploads on the channel, not just the page we fetched — matches
    // what the Discogs endpoints report in pagination.items.
    pagination: { items: pl.pageInfo?.totalResults ?? releases.length, perPage: max },
  };
  setChannelCache(cacheKey, out);
  return out;
}

// ─── Track search (YouTube Data API search.list) ──────────────────────────────
// Fills tracklist rows that Discogs' own videos[] didn't cover. search.list is
// the one expensive YouTube call — 100 units against a 10,000/day project
// quota — so every call goes through three guards:
//   1. ONE query per track (the old /api/discogs/youtube/search tried up to 7),
//   2. results cached in youtube_cache — hits for 90 days, misses for 14,
//   3. a daily unit cap (YOUTUBE_DAILY_UNIT_CAP, default 5000) tracked in
//      api_quota, leaving the rest of the quota for videos/channels lookups.

const SEARCH_COST = 100;
const SEARCH_HIT_TTL = 90 * 24 * 60 * 60 * 1000;
const SEARCH_MISS_TTL = 14 * 24 * 60 * 60 * 1000;
const dailyCap = () => Number(process.env.YOUTUBE_DAILY_UNIT_CAP) || 5000;
const today = () => new Date().toISOString().slice(0, 10);

export function quotaUsed(provider = 'youtube') {
  return db.prepare('SELECT units FROM api_quota WHERE provider = ? AND day = ?').get(provider, today())?.units || 0;
}

// Reserve units up front; false if that would cross the cap.
function spendQuota(units, provider = 'youtube') {
  if (quotaUsed(provider) + units > dailyCap()) return false;
  db.prepare(`INSERT INTO api_quota (provider, day, units) VALUES (?, ?, ?)
              ON CONFLICT(provider, day) DO UPDATE SET units = units + excluded.units`)
    .run(provider, today(), units);
  return true;
}

function searchScore(item, trackTitle, artist) {
  const vt = item.snippet?.title || '';
  const ch = normalize(item.snippet?.channelTitle || '');
  let score = matchScore(vt, trackTitle, artist);
  if (!artist) score -= 20; // matchScore's artist bonus: '' is in every title
  const v = normalize(vt), tt = normalize(trackTitle);
  // matchScore penalises "remix"/"live" outright; undo that when the track
  // itself is a remix/live version.
  if (/remix|live/.test(tt) && /remix|live/.test(v)) score += 20;
  if (artist && ch.includes(normalize(artist))) score += 15; // artist's own / Topic channel
  if (/ topic$/.test(ch)) score += 10;                        // distributor upload = the release audio
  if (/full album|full ep|album mix/.test(v)) score -= 40;
  return score;
}

/**
 * Best YouTube video for one track, or null.
 * Returns { youtube_url, youtube_title, cached, capped }.
 */
export async function searchTrackVideo(artist, trackTitle, { label = '' } = {}) {
  const a = /^various$/i.test((artist || '').trim()) ? '' : (artist || '').trim();
  const title = (trackTitle || '').trim();
  if (!title) return { youtube_url: null, youtube_title: null };

  const cacheKey = `search|${a}|${title}`.toLowerCase();
  const row = db.prepare('SELECT * FROM youtube_cache WHERE query = ?').get(cacheKey);
  if (row) {
    const age = Date.now() - new Date(row.fetched_at).getTime();
    if (age < (row.youtube_url ? SEARCH_HIT_TTL : SEARCH_MISS_TTL)) {
      return { youtube_url: row.youtube_url, youtube_title: row.youtube_title, cached: true };
    }
  }

  if (!spendQuota(SEARCH_COST)) return { youtube_url: null, youtube_title: null, capped: true };

  const q = a ? `${a} ${title}` : `${title} ${label}`.trim();
  let data;
  try {
    data = await ytApi('search', { part: 'snippet', type: 'video', maxResults: '5', q });
  } catch (e) {
    // Out of quota at Google's end: treat as capped, don't cache a false miss.
    if (/quota/i.test(e.message)) return { youtube_url: null, youtube_title: null, capped: true };
    throw e;
  }

  let best = null, bestScore = -Infinity;
  for (const item of data.items || []) {
    const s = searchScore(item, title, a);
    if (s > bestScore) { bestScore = s; best = item; }
  }
  // Title must match (>=30). With a known artist, also want the artist in the
  // video title (+20) or channel (+15) — a bare title match (50), even on a
  // Topic channel (+10), could be anyone's track of the same name.
  const threshold = a ? 65 : 30;
  const hit = best && bestScore >= threshold ? best : null;
  const youtube_url = hit ? `https://www.youtube.com/watch?v=${hit.id.videoId}` : null;
  const youtube_title = hit?.snippet?.title || null;
  setCache(cacheKey, youtube_url, youtube_title);
  return { youtube_url, youtube_title, cached: false };
}
