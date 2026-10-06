import fetch from 'node-fetch';
import db from '../db/database.js';
import { logEvent } from './logService.js';

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

// ─── Channel crawler ──────────────────────────────────────────────────────────
// gabriel, 2026-10-02: HÖR has 10,194 uploads and the spotlight showed the
// newest 24. Every upload of a spotlighted channel is now collected into
// yt_channel_videos: the uploads playlist, 50 per request at 1 quota unit
// each (HÖR ≈ 204 units, once), in the background and under the daily cap
// (spendQuota) — a crawl cut off by the cap resumes from next_page next time
// the channel is asked for. Once the backfill is done, a refresh every 12h
// reads from the newest end until it meets a video it already has.

const CRAWL_GAP_MS = 150;
const REFRESH_EVERY_MS = 12 * 60 * 60 * 1000;
const crawling = new Set();

const channelRow = id => db.prepare('SELECT * FROM yt_channels WHERE channel_id = ?').get(id);
const videoCount = id => db.prepare('SELECT COUNT(*) c FROM yt_channel_videos WHERE channel_id = ?').get(id).c;

// The channel a video belongs to: already crawled -> free; else 2 units.
async function ensureChannel(videoId) {
  const known = db.prepare('SELECT channel_id FROM yt_channel_videos WHERE video_id = ?').get(videoId);
  if (known) { const row = channelRow(known.channel_id); if (row) return row; }

  if (!spendQuota(2)) throw new Error('Daily YouTube quota reached — try again tomorrow');
  const vid = await ytApi('videos', { part: 'snippet', id: videoId });
  const channelId = vid.items?.[0]?.snippet?.channelId;
  if (!channelId) throw new Error(`Video ${videoId} not found`);
  const existing = channelRow(channelId);
  if (existing) return existing;
  const ch = await ytApi('channels', { part: 'contentDetails,snippet,statistics', id: channelId });
  const item = ch.items?.[0];
  const uploadsId = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error(`No uploads playlist for channel ${channelId}`);
  db.prepare('INSERT OR IGNORE INTO yt_channels (channel_id, uploads_id, title, thumb, total) VALUES (?, ?, ?, ?, ?)')
    .run(channelId, uploadsId, item.snippet?.title || '', item.snippet?.thumbnails?.default?.url || null, Number(item.statistics?.videoCount) || null);
  saveChannelStats(item);
  return channelRow(channelId);
}

// ─── Proper channels (2026-10-05) ─────────────────────────────────────────────
// gabriel: only channels worth having can be ♥'d — "not some 10 video
// channel but an official channel". YouTube has no "official" flag in its
// API, so it's judged from its numbers: enough uploads, enough subscribers
// and a channel that's been going a while. Hidden subscriber counts don't
// pass on their own. An admin can mark a channel official, or not, by
// name (channel_status), over the numbers.
export const PROPER_CHANNEL = { minUploads: 50, minSubscribers: 1000, minAgeDays: 365 };
const STATS_EVERY_DAYS = 30;

function saveChannelStats(item) {
  const st = item?.statistics || {}, sn = item?.snippet || {};
  db.prepare(`UPDATE yt_channels SET subscribers = ?, subs_hidden = ?, started_at = ?, handle = ?, total = COALESCE(?, total), stats_at = datetime('now')
    WHERE channel_id = ?`).run(st.hiddenSubscriberCount ? null : (Number(st.subscriberCount) || 0), st.hiddenSubscriberCount ? 1 : 0,
    sn.publishedAt || null, sn.customUrl || null, Number(st.videoCount) || null, item.id);
}

// Channels without numbers (or numbers older than STATS_EVERY_DAYS) get
// them, 50 per request at 1 unit each — from the keeper's sweep.
export async function refreshChannelStats() {
  const ids = db.prepare(`SELECT channel_id FROM yt_channels WHERE stats_at IS NULL OR stats_at < datetime('now', ?)`)
    .all(`-${STATS_EVERY_DAYS} days`).map(r => r.channel_id);
  for (let i = 0; i < ids.length; i += 50) {
    if (!spendQuota(1)) return;
    const ch = await ytApi('channels', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
    for (const item of ch.items || []) saveChannelStats(item);
  }
}

// Whether a channel can be ♥'d, and why — for the admin view too.
export function channelVerdict(row, official) {
  if (official === 1 || official === 0) return { proper: !!official, why: official ? 'marked official' : 'marked not' };
  if (!row) return { proper: false, why: 'not a YouTube channel we know' };
  if (!row.stats_at) return { proper: false, why: 'numbers not fetched yet' };
  const ageDays = row.started_at ? (Date.now() - new Date(row.started_at).getTime()) / 86400000 : 0;
  const misses = [];
  if ((row.total || 0) < PROPER_CHANNEL.minUploads) misses.push(`under ${PROPER_CHANNEL.minUploads} uploads`);
  if (row.subs_hidden) misses.push('subscribers hidden');
  else if ((row.subscribers || 0) < PROPER_CHANNEL.minSubscribers) misses.push(`under ${PROPER_CHANNEL.minSubscribers.toLocaleString('en-GB')} subscribers`);
  if (ageDays < PROPER_CHANNEL.minAgeDays) misses.push('under a year old');
  return misses.length ? { proper: false, why: misses.join(', ') } : { proper: true, why: 'passes the numbers' };
}

// Every channel name in use (posted live sets + crawled channels), with its
// verdict. Names match the YouTube channel title, ignoring case.
export function channelsWithVerdicts() {
  const overrides = new Map(db.prepare('SELECT name_key, official FROM channel_status').all().map(r => [r.name_key, r.official]));
  const rows = new Map(db.prepare('SELECT * FROM yt_channels').all().map(r => [String(r.title || '').toLowerCase(), r]));
  const names = new Map();
  for (const r of rows.values()) if (r.title) names.set(r.title.toLowerCase(), r.title);
  for (const { channel } of db.prepare("SELECT DISTINCT channel FROM posts WHERE channel IS NOT NULL AND trim(channel) <> ''").all()) {
    if (!names.has(channel.toLowerCase())) names.set(channel.toLowerCase(), channel);
  }
  return [...names].map(([key, name]) => {
    const row = rows.get(key) || null;
    const official = overrides.has(key) ? overrides.get(key) : null;
    return {
      name, official,
      uploads: row?.total ?? null, subscribers: row?.subscribers ?? null, subs_hidden: !!row?.subs_hidden,
      started_at: row?.started_at || null, handle: row?.handle || null,
      ...channelVerdict(row, official),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export function setChannelOfficial(name, official) {
  const clean = String(name || '').trim().slice(0, 200);
  if (!clean) return false;
  if (official === null) db.prepare('DELETE FROM channel_status WHERE name_key = ?').run(clean.toLowerCase());
  else db.prepare('INSERT OR REPLACE INTO channel_status (name_key, name, official) VALUES (?, ?, ?)').run(clean.toLowerCase(), clean, official ? 1 : 0);
  return true;
}

// One page of the uploads playlist into yt_channel_videos.
// -> { added, known, nextPageToken } or null when out of quota.
// The background crawl stops at this share of the daily cap, so the
// expensive track searches (100 units each) always keep their budget.
const CRAWL_QUOTA_SHARE = 0.6;

async function crawlPage(row, pageToken, { background = true } = {}) {
  if (background && quotaUsed() >= dailyCap() * CRAWL_QUOTA_SHARE) return null;
  if (!spendQuota(1)) return null;
  const params = { part: 'snippet,contentDetails', playlistId: row.uploads_id, maxResults: '50' };
  if (pageToken) params.pageToken = pageToken;
  const pl = await ytApi('playlistItems', params);
  const ins = db.prepare('INSERT OR IGNORE INTO yt_channel_videos (video_id, channel_id, title, published_at, thumb) VALUES (?, ?, ?, ?, ?)');
  let added = 0, known = 0;
  for (const it of pl.items || []) {
    const s = it.snippet || {};
    const id = it.contentDetails?.videoId || s.resourceId?.videoId;
    if (!id) continue;
    // Deleted/private uploads stay in the playlist with a placeholder title.
    if (/^(Deleted|Private) video$/i.test(s.title || '')) continue;
    const r = ins.run(id, row.channel_id, s.title || '', it.contentDetails?.videoPublishedAt || s.publishedAt || null,
      s.thumbnails?.medium?.url || s.thumbnails?.default?.url || null);
    if (r.changes) added++; else known++;
  }
  if (pl.pageInfo?.totalResults) db.prepare('UPDATE yt_channels SET total = ? WHERE channel_id = ?').run(pl.pageInfo.totalResults, row.channel_id);
  return { added, known, nextPageToken: pl.nextPageToken || null };
}

const markBackfill = (channelId, token) => {
  db.prepare('UPDATE yt_channels SET next_page = ?, backfill_done = ? WHERE channel_id = ?').run(token, token ? 0 : 1, channelId);
  if (!token) db.prepare("UPDATE yt_channels SET refreshed_at = datetime('now') WHERE channel_id = ?").run(channelId);
};

// Background: new uploads first (refresh), then the rest of the backfill.
async function crawlChannel(channelId) {
  if (crawling.has(channelId)) return;
  crawling.add(channelId);
  try {
    let row = channelRow(channelId);
    const stale = !row.refreshed_at || Date.now() - new Date(`${row.refreshed_at}Z`).getTime() > REFRESH_EVERY_MS;
    if (row.backfill_done && stale) {
      let token = null;
      for (;;) {
        const page = await crawlPage(row, token);
        if (!page) return;
        // Met uploads we already have: everything newer is in.
        if (page.known > 0 || !page.nextPageToken) break;
        token = page.nextPageToken;
        await new Promise(r => setTimeout(r, CRAWL_GAP_MS));
      }
      db.prepare("UPDATE yt_channels SET refreshed_at = datetime('now') WHERE channel_id = ?").run(channelId);
    }
    row = channelRow(channelId);
    while (!row.backfill_done) {
      const page = await crawlPage(row, row.next_page);
      if (!page) return; // daily cap — resumes from next_page next time
      markBackfill(channelId, page.nextPageToken);
      row = channelRow(channelId);
      await new Promise(r => setTimeout(r, CRAWL_GAP_MS));
    }
  } catch (err) {
    console.error('[channel crawl]', channelId, err.message);
    logEvent('error', 'crawl', `YouTube channel ${channelId}: ${err.message}`);
  } finally {
    crawling.delete(channelId);
  }
}

/**
 * Keeps channel crawls going without being asked: at startup and hourly,
 * every channel already known resumes its backfill / gets its 12-hourly
 * refresh, and every YouTube live set posted whose channel isn't known yet
 * is looked up (2 units) and crawled. All under the crawl's quota share.
 */
export function startChannelKeeper() {
  const sweep = async () => {
    try {
      // Channel numbers for the ♥ rule (proper channels), 1 unit per 50.
      await refreshChannelStats().catch(err => logEvent('error', 'crawl', `YouTube channel numbers: ${err.message}`));
      for (const { channel_id } of db.prepare('SELECT channel_id FROM yt_channels').all()) await crawlChannel(channel_id);
      const sets = db.prepare("SELECT stream_url FROM posts WHERE post_type = 'livemix' AND stream_url LIKE '%youtu%'").all();
      for (const { stream_url } of sets) {
        const vid = extractVideoId(stream_url);
        if (!vid || db.prepare('SELECT 1 FROM yt_channel_videos WHERE video_id = ?').get(vid)) continue;
        if (quotaUsed() >= dailyCap() * CRAWL_QUOTA_SHARE) break;
        const row = await ensureChannel(vid).catch(() => null);
        if (row) await crawlChannel(row.channel_id);
      }
    } catch (err) {
      console.error('[channel keeper]', err.message);
      logEvent('error', 'crawl', `Channel keeper: ${err.message}`);
    }
  };
  setTimeout(sweep, 20000);
  setInterval(sweep, 60 * 60 * 1000);
}

/**
 * A page of a channel's uploads from the crawl, newest first, optionally
 * filtered by title. Starts (or resumes) the crawl in the background; the
 * very first call for a channel waits for its first 50 so the card isn't
 * empty. Same shape as the Discogs catalogue endpoints, plus `crawl`.
 */
export async function getChannelUploads(videoId, { offset = 0, limit = 100, q = '' } = {}) {
  const row = await ensureChannel(videoId);
  if (videoCount(row.channel_id) === 0 && !row.backfill_done && !crawling.has(row.channel_id)) {
    // Someone is looking at this card: the first page isn't held to the crawl's quota share.
    const page = await crawlPage(row, null, { background: false });
    if (page) markBackfill(row.channel_id, page.nextPageToken);
  }
  crawlChannel(row.channel_id); // not awaited

  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const term = String(q || '').trim().toLowerCase();
  // instr() rather than LIKE: no wildcard escaping to get wrong.
  const where = term ? 'channel_id = ? AND instr(lower(title), ?) > 0' : 'channel_id = ?';
  const args = term ? [row.channel_id, term] : [row.channel_id];
  const matched = db.prepare(`SELECT COUNT(*) c FROM yt_channel_videos WHERE ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM yt_channel_videos WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`).all(...args, lim, off);
  const fresh = channelRow(row.channel_id);
  const have = videoCount(row.channel_id);

  return {
    channel: { id: fresh.channel_id, title: fresh.title, thumb: fresh.thumb },
    releases: rows.map(v => ({
      // `id` is the VIDEO id (a string) — the frontend treats it as opaque.
      id: v.video_id,
      title: v.title,
      year: v.published_at ? Number(v.published_at.slice(0, 4)) : null,
      thumb: v.thumb,
      url: `https://www.youtube.com/watch?v=${v.video_id}`,
    })),
    pagination: { items: fresh.total || have, offset: off, limit: lim, matched },
    crawl: { have, total: fresh.total || have, done: !!fresh.backfill_done, running: crawling.has(row.channel_id) },
  };
}

// ─── Track search (YouTube Data API search.list) ──────────────────────────────
// Fills tracklist rows that Discogs' own videos[] didn't cover. search.list is
// the one expensive YouTube call — 100 units against a 10,000/day project
// quota — so every call goes through three guards:
//   1. ONE query per track (the old /api/discogs/youtube/search tried up to 7),
//   2. results cached in youtube_cache — hits for 90 days, misses for 30,
//   3. a daily unit cap (YOUTUBE_DAILY_UNIT_CAP, default 5000) tracked in
//      api_quota, leaving the rest of the quota for videos/channels lookups.

const SEARCH_COST = 100;
const SEARCH_HIT_TTL = 90 * 24 * 60 * 60 * 1000;
const SEARCH_MISS_TTL = 30 * 24 * 60 * 60 * 1000;
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
// `localOnly` (the gap sweep, 2026-10-06): stop after the free checks —
// the cache and the crawled channel uploads — and never spend quota.
export async function searchTrackVideo(artist, trackTitle, { label = '', localOnly = false } = {}) {
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

  // DB first (2026-10-02): uploads the channel crawler already collected.
  // Scored like a real search result (the channel title stands in for
  // snippet.channelTitle); a hit costs no quota at all.
  const local = db.prepare(`SELECT v.video_id, v.title, c.title channel FROM yt_channel_videos v
                            JOIN yt_channels c ON c.channel_id = v.channel_id
                            WHERE instr(lower(v.title), ?) > 0 LIMIT 50`).all(title.toLowerCase());
  let localBest = null, localScore = -Infinity;
  for (const v of local) {
    const sc = searchScore({ snippet: { title: v.title, channelTitle: v.channel } }, title, a);
    if (sc > localScore) { localScore = sc; localBest = v; }
  }
  if (localBest && localScore >= (a ? 65 : 30)) {
    const url = `https://www.youtube.com/watch?v=${localBest.video_id}`;
    setCache(cacheKey, url, localBest.title);
    return { youtube_url: url, youtube_title: localBest.title, cached: false, local: true };
  }
  if (localOnly) return { youtube_url: null, youtube_title: null, localOnly: true };

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
