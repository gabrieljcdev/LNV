// Spend the YouTube units a day did not use (2026-10-09, gabriel: "might as well use them if we have them").
// Units do not roll over, and the site uses a small part of the 5,000-unit day, so in the last hours before the
// quota resets (midnight Pacific) this finds playable links for tracks people want. What to search, in order:
//   1. Tracks someone already tried to hear and got only a Spotify placeholder (release_track_links): proven demand.
//   2. Tracks of the records on the Discogs lists (collection first, then wantlist) that have no link yet.
//   3. Tracks on live posts that have no YouTube link.
// Newest first within each group. Skipped: a track searched in the last 30 days (spare_quota_tried), a record that has
// used its paid searches (searchBudget: 3 a record, and the breaker), user-added links. It stops when only SPARE_QUOTA_RESERVE
// units are left. Runs once per quota day; SPARE_QUOTA=0 switches it off. Admin can run it by hand (POST /api/admin/spare-quota).
import db from '../db/database.js';
import { searchTrackVideo, quotaUsed } from './youtubeService.js';
import { getRelease } from './discogsService.js';
import { searchBudget } from './searchBudget.js';
import { linkKeysOf } from './releaseSpotify.js';
import { logEvent } from './logService.js';
import { quotaDay, minutesToQuotaReset } from './quotaDay.js';

db.exec(`CREATE TABLE IF NOT EXISTS spare_quota_tried (
  kind TEXT NOT NULL, ref TEXT NOT NULL, tried_at TEXT NOT NULL DEFAULT (datetime('now')), found INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, ref))`);

const SEARCH_COST = 100;
const cap = () => Number(process.env.YOUTUBE_DAILY_UNIT_CAP) || 5000;
const reserve = () => Number(process.env.SPARE_QUOTA_RESERVE ?? 200);
const windowMin = () => Number(process.env.SPARE_QUOTA_WINDOW_MIN ?? 180);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tried = db.prepare("SELECT 1 FROM spare_quota_tried WHERE kind = ? AND ref = ? AND tried_at > datetime('now', '-30 days')");
const markTried = db.prepare(`INSERT INTO spare_quota_tried (kind, ref, tried_at, found) VALUES (?, ?, datetime('now'), ?)
  ON CONFLICT(kind, ref) DO UPDATE SET tried_at = excluded.tried_at, found = excluded.found`);
const relStats = db.prepare(`SELECT COALESCE(SUM(paid), 0) paid, COALESCE(SUM(youtube_url IS NOT NULL), 0) hits,
  COALESCE(SUM(youtube_url IS NULL AND spotify_url IS NULL AND fetched_at > datetime('now', '-30 days')), 0) misses
  FROM release_track_links WHERE release_id = ?`);
const haveLink = db.prepare('SELECT youtube_url FROM release_track_links WHERE release_id = ? AND position = ?');
const saveLink = db.prepare(`INSERT INTO release_track_links (release_id, position, title, youtube_url, youtube_title, source, fetched_at, paid)
  VALUES (?, ?, ?, ?, ?, 'youtube-spare', datetime('now'), ?)
  ON CONFLICT(release_id, position) DO UPDATE SET youtube_url = excluded.youtube_url, youtube_title = excluded.youtube_title,
    source = excluded.source, fetched_at = excluded.fetched_at, paid = release_track_links.paid + excluded.paid
  WHERE release_track_links.youtube_url IS NULL`);

const relCache = new Map();
async function release(id) {
  if (!relCache.has(id)) {
    relCache.set(id, await getRelease(id, { background: true }).catch(() => null));
    await sleep(1500);   // gentle on Discogs, alongside the other jobs
  }
  return relCache.get(id);
}
// The tracks of a release as the link table keys them: [{ key, title, artist }], headings left out.
function keyedTracks(rel) {
  const list = rel?.tracklist || [];
  const kept = list.filter(t => t.title && (t.position || !list.some(x => x.position)));
  const ks = linkKeysOf(kept);
  const relArtist = (rel?.artists || []).map(a => a.name).filter(Boolean).join(', ');
  return kept.map((t, i) => ({ key: ks[i], title: t.title, artist: (t.artists || []).map(a => a.name).filter(Boolean).join(', ') || relArtist }));
}

// Candidates, as lazy generators so nothing is fetched that the units will not reach.
async function* placeholders() {
  const rows = db.prepare(`SELECT release_id, position, title FROM release_track_links
    WHERE youtube_url IS NULL AND spotify_url IS NOT NULL AND COALESCE(source, '') <> 'user' ORDER BY fetched_at DESC`).all();
  for (const r of rows) {
    if (tried.get('rtl', `${r.release_id}|${r.position}`)) continue;
    const rel = await release(r.release_id);
    const t = keyedTracks(rel).find(x => x.key === r.position);
    yield { group: 'wanted', kind: 'rtl', ref: `${r.release_id}|${r.position}`, releaseId: r.release_id, position: r.position, title: r.title || t?.title, artist: t?.artist || '', label: rel?.labels?.[0]?.name || '', catno: rel?.labels?.[0]?.catno || '' };
  }
}
async function* listTracks() {
  const rows = db.prepare(`SELECT pr.discogs_id id FROM playlist_releases pr JOIN playlists p ON p.id = pr.playlist_id
    WHERE p.kind IN ('collection', 'wantlist') ORDER BY (p.kind = 'collection') DESC, pr.added_at DESC`).all();
  const seen = new Set();
  for (const { id } of rows) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rel = await release(id);
    for (const t of keyedTracks(rel)) {
      if (!t.key) continue;
      if (haveLink.get(id, t.key)?.youtube_url) continue;
      if (tried.get('rtl', `${id}|${t.key}`)) continue;
      yield { group: 'lists', kind: 'rtl', ref: `${id}|${t.key}`, releaseId: id, position: t.key, title: t.title, artist: t.artist, label: rel?.labels?.[0]?.name || '', catno: rel?.labels?.[0]?.catno || '' };
    }
  }
}
async function* postTracks() {
  const rows = db.prepare(`SELECT t.id, t.title, t.post_id, p.discogs_id,
      (SELECT artist_name FROM post_artists a WHERE a.post_id = t.post_id ORDER BY a.id LIMIT 1) AS artist,
      (SELECT label_name FROM post_labels l WHERE l.post_id = t.post_id ORDER BY l.id LIMIT 1) AS label
    FROM post_tracks t JOIN posts p ON p.id = t.post_id
    WHERE COALESCE(t.youtube_url, '') NOT LIKE '%youtu%' ORDER BY t.post_id DESC, t.id`).all();
  for (const r of rows) {
    if (tried.get('post', String(r.id))) continue;
    yield { group: 'posts', kind: 'post', ref: String(r.id), trackId: r.id, releaseId: null, title: r.title, artist: r.artist || '', label: r.label || '', catno: '' };
  }
}

let running = false;
export async function runSpareQuota({ force = false, dry = false } = {}) {
  if (running) return { skipped: 'already running' };
  const day = quotaDay();
  if (!force && !dry && db.prepare("SELECT 1 FROM api_quota WHERE provider = 'spare-run' AND day = ?").get(day)) return { skipped: 'already ran today' };
  const units = () => cap() - reserve() - quotaUsed();
  if (units() < SEARCH_COST) return { skipped: `only ${Math.max(0, cap() - quotaUsed())} units left` };
  running = true;
  const out = { day, startUnits: quotaUsed(), searches: 0, found: 0, byGroup: {}, dry };
  try {
    if (!dry) db.prepare("INSERT OR REPLACE INTO api_quota (provider, day, units) VALUES ('spare-run', ?, 1)").run(day);
    const budget = Math.floor(units() / SEARCH_COST);
    for (const gen of [placeholders, listTracks, postTracks]) {
      for await (const c of gen()) {
        if (dry ? out.searches >= budget : units() < SEARCH_COST) break;
        if (!c.title) continue;
        if (c.releaseId) {   // a record that has had its paid searches (or keeps missing) is left alone
          const b = searchBudget({ used: 0, cap: cap(), listening: false, release: relStats.get(c.releaseId) });
          if (b.held) continue;
        }
        const g = (out.byGroup[c.group] ||= { searches: 0, found: 0 });
        if (dry) { g.searches++; out.searches++; continue; }
        let r = null;
        try { r = await searchTrackVideo(c.artist, c.title, { label: c.label, catno: c.catno }); } catch { /* next */ }
        if (r?.capped) break;
        if (!r) continue;
        const paid = r.cached === false && !r.local ? 1 : 0;
        if (paid) { g.searches++; out.searches++; }
        if (r.youtube_url) {
          g.found++; out.found++;
          if (c.releaseId && c.position != null) saveLink.run(c.releaseId, String(c.position), c.title, r.youtube_url, r.youtube_title || null, paid);
          if (c.kind === 'post') db.prepare("UPDATE post_tracks SET youtube_url = ?, stream_url = COALESCE(NULLIF(stream_url, ''), ?) WHERE id = ? AND COALESCE(youtube_url, '') NOT LIKE '%youtu%'").run(r.youtube_url, r.youtube_url, c.trackId);
        }
        markTried.run(c.kind, c.ref, r.youtube_url ? 1 : 0);
        await sleep(800);
      }
    }
    out.endUnits = quotaUsed();
    if (!dry) logEvent('info', 'crawl', `Spare YouTube units: ${out.searches} searches found ${out.found} links (${Object.entries(out.byGroup).map(([k, v]) => `${k} ${v.found}/${v.searches}`).join(', ') || 'nothing to search'}); ${Math.max(0, cap() - out.endUnits)} units left for the day`);
    return out;
  } catch (err) {
    logEvent('error', 'crawl', `Spare-quota run: ${err.message}`);
    return { ...out, error: err.message };
  } finally { running = false; }
}

// Checks every 10 minutes; in the last hours of the quota day, runs once.
export function startSpareQuota() {
  if (process.env.SPARE_QUOTA === '0') return;
  setInterval(() => {
    if (minutesToQuotaReset() <= windowMin()) runSpareQuota().catch(() => {});
  }, 10 * 60 * 1000);
}
