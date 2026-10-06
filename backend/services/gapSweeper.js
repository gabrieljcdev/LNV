// The gap sweep (2026-10-06, gabriel: "periodic sweeps on all platforms to
// try and fill gaps in the DB"). The hourly jobs already match posts to
// Discogs (discogsMatcher), fill catalogues (startCatalogueKeeper) and
// crawl YouTube channels (startChannelKeeper). This fills what they leave:
//
// 1. Posts matched to a Discogs release but missing details: artist and
//    label ids (no id = no catalogue or spotlight), genres + styles, the
//    year, and the tracklist — only on posts made from a Discogs link,
//    where the release IS the post (a single YouTube track from an album
//    must not grow the album's tracklist). Read from the release (cached
//    30 days), filling only what's empty — nothing is ever overwritten.
//    Posts with no release still lacking genres: Last.fm tags (if keyed).
// 2. Tracks with nothing to play: tried against the cache and the crawled
//    channel uploads (free), then a few paid YouTube searches a day at most
//    (GAP_SWEEP_YT_SEARCHES, default 5 = 500 of the 5,000 daily units).
//
// Each post / track is retried at most once a week (gaps_checked_at,
// link_checked_at). Runs a few minutes after startup, then every 6 hours.
// What it filled goes to the admin log (kind 'crawl').

import db from '../db/database.js';
import { getRelease } from './discogsService.js';
import { searchTrackVideo } from './youtubeService.js';
import { logEvent } from './logService.js';
import { lastfmConfigured, lastfmGenres } from './lastfmService.js';
import { platformGenres } from '../routes/media.js';

try { db.exec('ALTER TABLE posts ADD COLUMN gaps_checked_at TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE post_tracks ADD COLUMN link_checked_at TEXT'); } catch { /* already there */ }

const RECHECK = '-7 days';
// Posts made from a Discogs link (no platform recorded on the oldest ones).
const DISCOGS_POST = "COALESCE(p.platform, 'discogs') = 'discogs'";
const DISCOGS_GAP_MS = 3000; // well under Discogs' 60/min alongside the other jobs
const paidPerDay = () => Number(process.env.GAP_SWEEP_YT_SEARCHES ?? 5);
const today = () => new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = s => String(s || '').toLowerCase().replace(/\s*-\s*topic$/, '').replace(/\s*\(\d+\)$/, '').replace(/[^\p{L}\p{N}]+/gu, '');

// The sweep's own count of paid searches today (api_quota, its own row).
const paidUsed = () => db.prepare("SELECT units FROM api_quota WHERE provider = 'gap-sweep' AND day = ?").get(today())?.units || 0;
const notePaid = () => db.prepare(`INSERT INTO api_quota (provider, day, units) VALUES ('gap-sweep', ?, 1)
  ON CONFLICT(provider, day) DO UPDATE SET units = units + 1`).run(today());

// What's missing right now (also shown in Admin → Status).
export function gapCounts() {
  const c = sql => db.prepare(sql).get().c;
  return {
    artistIds: c(`SELECT COUNT(*) c FROM post_artists a JOIN posts p ON p.id = a.post_id WHERE a.discogs_artist_id IS NULL AND p.discogs_id IS NOT NULL`),
    labelIds: c(`SELECT COUNT(*) c FROM post_labels l JOIN posts p ON p.id = l.post_id WHERE l.discogs_label_id IS NULL AND p.discogs_id IS NOT NULL`),
    genres: c(`SELECT COUNT(*) c FROM posts p WHERE p.is_spotlight = 0 AND NOT EXISTS (SELECT 1 FROM post_genres g WHERE g.post_id = p.id)`),
    years: c(`SELECT COUNT(*) c FROM posts WHERE is_spotlight = 0 AND year IS NULL AND COALESCE(post_type, '') != 'livemix'`),
    tracklists: c(`SELECT COUNT(*) c FROM posts p WHERE p.is_spotlight = 0 AND COALESCE(p.post_type, '') != 'livemix' AND ${DISCOGS_POST} AND NOT EXISTS (SELECT 1 FROM post_tracks t WHERE t.post_id = p.id)`),
    unplayable: c(`SELECT COUNT(*) c FROM post_tracks WHERE COALESCE(youtube_url, '') = '' AND COALESCE(stream_url, '') = ''`),
    unmatched: c(`SELECT COUNT(*) c FROM posts WHERE is_spotlight = 0 AND discogs_id IS NULL AND COALESCE(post_type, '') != 'livemix'`),
  };
}

// Pairs names on the post with the release's (same name, or the only one
// left on each side) and returns [{ rowId, id }] to fill.
function pairIds(rows, nameCol, idCol, fromRelease) {
  const missing = rows.filter(r => r[idCol] == null);
  if (!missing.length) return [];
  const taken = new Set(rows.filter(r => r[idCol] != null).map(r => r[idCol]));
  const free = fromRelease.filter(x => x.id && !taken.has(x.id));
  const out = [];
  for (const r of missing) {
    const hit = free.find(x => key(x.name) === key(r[nameCol]));
    if (hit) { out.push({ rowId: r.id, id: hit.id }); free.splice(free.indexOf(hit), 1); }
  }
  const left = missing.filter(r => !out.some(o => o.rowId === r.id));
  if (left.length === 1 && free.length === 1) out.push({ rowId: left[0].id, id: free[0].id });
  return out;
}

async function fillFromReleases() {
  const posts = db.prepare(`
    SELECT p.id, p.discogs_id, p.year, p.platform FROM posts p
    WHERE p.is_spotlight = 0 AND p.discogs_id IS NOT NULL AND COALESCE(p.discogs_type, 'release') = 'release'
      AND (p.gaps_checked_at IS NULL OR p.gaps_checked_at < datetime('now', '${RECHECK}'))
      AND (EXISTS (SELECT 1 FROM post_artists a WHERE a.post_id = p.id AND a.discogs_artist_id IS NULL)
        OR EXISTS (SELECT 1 FROM post_labels l WHERE l.post_id = p.id AND l.discogs_label_id IS NULL)
        OR NOT EXISTS (SELECT 1 FROM post_genres g WHERE g.post_id = p.id)
        OR (p.year IS NULL AND COALESCE(p.post_type, '') != 'livemix')
        OR (NOT EXISTS (SELECT 1 FROM post_tracks t WHERE t.post_id = p.id) AND COALESCE(p.post_type, '') != 'livemix' AND ${DISCOGS_POST}))
    ORDER BY p.id DESC`).all();
  const filled = { artistIds: 0, labelIds: 0, genres: 0, years: 0, tracklists: 0 };
  for (const p of posts) {
    let rel = null;
    try { rel = await getRelease(p.discogs_id, { background: true }); } catch { /* next week */ }
    if (rel) db.transaction(() => {
      const artists = db.prepare('SELECT id, artist_name, discogs_artist_id FROM post_artists WHERE post_id = ?').all(p.id);
      for (const f of pairIds(artists, 'artist_name', 'discogs_artist_id', rel.artists || [])) {
        db.prepare('UPDATE post_artists SET discogs_artist_id = ? WHERE id = ? AND discogs_artist_id IS NULL').run(f.id, f.rowId); filled.artistIds++;
      }
      const labels = db.prepare('SELECT id, label_name, discogs_label_id FROM post_labels WHERE post_id = ?').all(p.id);
      for (const f of pairIds(labels, 'label_name', 'discogs_label_id', rel.labels || [])) {
        db.prepare('UPDATE post_labels SET discogs_label_id = ? WHERE id = ? AND discogs_label_id IS NULL').run(f.id, f.rowId); filled.labelIds++;
      }
      if (!db.prepare('SELECT 1 FROM post_genres WHERE post_id = ?').get(p.id)) {
        const names = [...new Set([...(rel.genres || []), ...(rel.styles || [])])];
        for (const g of names) db.prepare('INSERT INTO post_genres (post_id, genre) VALUES (?, ?)').run(p.id, g);
        if (names.length) filled.genres++;
      }
      if (p.year == null && rel.year) { db.prepare('UPDATE posts SET year = ? WHERE id = ? AND year IS NULL').run(rel.year, p.id); filled.years++; }
      if ((p.platform || 'discogs') === 'discogs' && !db.prepare('SELECT 1 FROM post_tracks WHERE post_id = ?').get(p.id) && rel.tracklist?.length) {
        const it = db.prepare('INSERT INTO post_tracks (post_id, position, title, duration) VALUES (?, ?, ?, ?)');
        for (const t of rel.tracklist) if (t.title) it.run(p.id, t.position || null, t.title, t.duration || null);
        filled.tracklists++;
      }
    })();
    db.prepare("UPDATE posts SET gaps_checked_at = datetime('now') WHERE id = ?").run(p.id);
    await sleep(DISCOGS_GAP_MS);
  }
  return filled;
}

// Posts still without genres (no Discogs release to read them from): the
// Bandcamp / SoundCloud page's own tags first, then listeners' tags from
// Last.fm when its key is set (2026-10-06).
async function fillGenresFromLastfm() {
  const posts = db.prepare(`
    SELECT p.id, p.title, p.post_type, p.stream_url, (SELECT artist_name FROM post_artists a WHERE a.post_id = p.id ORDER BY a.id LIMIT 1) AS artist,
      (SELECT label_name FROM post_labels l WHERE l.post_id = p.id ORDER BY l.id LIMIT 1) AS label
    FROM posts p
    WHERE p.is_spotlight = 0 AND COALESCE(p.post_type, '') != 'livemix'
      AND NOT EXISTS (SELECT 1 FROM post_genres g WHERE g.post_id = p.id)
      AND (p.gaps_checked_at IS NULL OR p.gaps_checked_at < datetime('now', '${RECHECK}') OR p.discogs_id IS NULL)`).all();
  let filled = 0;
  for (const p of posts) {
    let tags = p.stream_url ? await platformGenres(p.stream_url, [p.artist, p.label]) : [];
    if (!tags.length && p.artist && lastfmConfigured()) tags = await lastfmGenres({ artist: p.artist, album: p.post_type === 'album' ? p.title : '', track: p.post_type === 'album' ? '' : p.title });
    if (!tags.length) continue;
    const ins = db.prepare('INSERT INTO post_genres (post_id, genre) VALUES (?, ?)');
    db.transaction(() => { if (!db.prepare('SELECT 1 FROM post_genres WHERE post_id = ?').get(p.id)) { for (const g of tags) ins.run(p.id, g); filled++; } })();
  }
  return filled;
}

async function fillTrackLinks() {
  const tracks = db.prepare(`
    SELECT t.id, t.title, t.post_id,
      (SELECT artist_name FROM post_artists a WHERE a.post_id = t.post_id ORDER BY a.id LIMIT 1) AS artist,
      (SELECT label_name FROM post_labels l WHERE l.post_id = t.post_id ORDER BY l.id LIMIT 1) AS label
    FROM post_tracks t
    WHERE COALESCE(t.youtube_url, '') = '' AND COALESCE(t.stream_url, '') = ''
      AND (t.link_checked_at IS NULL OR t.link_checked_at < datetime('now', '${RECHECK}'))
    ORDER BY t.post_id DESC, t.id`).all();
  let free = 0, paid = 0;
  for (const t of tracks) {
    const canPay = paidUsed() < paidPerDay();
    let r = null;
    try { r = await searchTrackVideo(t.artist || '', t.title, { label: t.label || '', localOnly: !canPay }); } catch { /* next week */ }
    if (r && !r.localOnly && !r.cached && !r.local && !r.capped) notePaid();
    if (r?.youtube_url) {
      db.prepare("UPDATE post_tracks SET youtube_url = ?, stream_url = COALESCE(NULLIF(stream_url, ''), ?) WHERE id = ? AND COALESCE(youtube_url, '') = ''")
        .run(r.youtube_url, r.youtube_url, t.id);
      if (r.local || r.cached) free++; else paid++;
    }
    // A free-only miss is retried tomorrow-ish (when there's paid budget);
    // a full search, hit or miss, waits a week.
    if (!r?.localOnly && !r?.capped) db.prepare("UPDATE post_tracks SET link_checked_at = datetime('now') WHERE id = ?").run(t.id);
  }
  return { free, paid };
}

let running = false;
export async function sweepGaps() {
  if (running) return null;
  running = true;
  try {
    const before = gapCounts();
    const rel = await fillFromReleases();
    rel.genres += await fillGenresFromLastfm();
    const links = await fillTrackLinks();
    const parts = [
      rel.artistIds && `${rel.artistIds} artist id${rel.artistIds === 1 ? '' : 's'}`,
      rel.labelIds && `${rel.labelIds} label id${rel.labelIds === 1 ? '' : 's'}`,
      rel.genres && `genres on ${rel.genres} post${rel.genres === 1 ? '' : 's'}`,
      rel.years && `${rel.years} year${rel.years === 1 ? '' : 's'}`,
      rel.tracklists && `${rel.tracklists} tracklist${rel.tracklists === 1 ? '' : 's'}`,
      (links.free + links.paid) && `${links.free + links.paid} track link${links.free + links.paid === 1 ? '' : 's'} (${links.paid} by paid search)`,
    ].filter(Boolean);
    if (parts.length) logEvent('info', 'crawl', `Gap sweep filled ${parts.join(', ')}`);
    return { before, after: gapCounts(), filled: { ...rel, ...links } };
  } catch (err) {
    console.error('[gap sweep]', err.message);
    logEvent('error', 'crawl', `Gap sweep: ${err.message}`);
    return null;
  } finally {
    running = false;
  }
}

export function startGapSweeper() {
  const run = () => sweepGaps();
  setTimeout(run, 3 * 60 * 1000); // after the other startup jobs
  setInterval(run, 6 * 60 * 60 * 1000);
}
