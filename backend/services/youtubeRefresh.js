// Keeping stored YouTube API data inside YouTube's 30-day limit (2026-10-22).
// YouTube API Services Developer Policies III.E.4.d: non-authorized API data may be stored for at most 30 calendar days,
// then it must be deleted or refreshed. The policy names no exemption for video ids, so every stored video id and the
// title / thumbnail that came with it count. The policy does not say whether a refresh restarts the clock; this treats
// it as doing so (the stored data is re-fetched from the API and so is current), which is the plain reading of "refresh".
//
// What is covered (all of it came from the YouTube API):
//   release_track_links  youtube_url / youtube_title   (not source 'user' or 'discogs-video': those did not come from the API)
//   youtube_cache        youtube_url / youtube_title   (search results)
//   yt_channel_videos    the crawled uploads of spotlighted channels
// Each night-ish tick re-fetches everything older than REFRESH_AFTER_DAYS with videos.list (1 unit per 50 ids): a video still
// there, public and embeddable gets its title confirmed and its clock restarted; one that is gone, private or has embedding off
// is cleared. Then, as a hard stop that does not depend on the API being reachable, anything still older than 30 days is cleared.
// Posts' own links (post_tracks) are not touched here: a pasted link is the poster's, and linkHealth.js already re-checks them.
import db from '../db/database.js';
import { ytApi, spendQuota, extractVideoId } from './youtubeService.js';
import { logEvent } from './logService.js';
import { quotaDay } from './quotaDay.js';

const REFRESH_AFTER_DAYS = 25;   // a 5-day margin under the 30-day limit
const LIMIT_DAYS = 30;
const DAILY_UNITS = () => Number(process.env.YT_REFRESH_UNITS_PER_DAY) || 2500;   // ~125,000 ids a day: the first catch-up fits in a day or two
const BATCH = 50;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SRC = "COALESCE(source, '') NOT IN ('user', 'discogs-video')";
// The three stores, as one shape: how to find stale rows, update one that is fine, clear one that is not.
const STORES = [
  {
    name: 'saved track links',
    stale: days => `SELECT rowid AS k, youtube_url AS url FROM release_track_links WHERE youtube_url LIKE '%youtu%' AND ${SRC} AND COALESCE(yt_refreshed_at, fetched_at) < datetime('now', '-${days} days') LIMIT ?`,
    ok: db.prepare("UPDATE release_track_links SET youtube_title = COALESCE(?, youtube_title), yt_refreshed_at = datetime('now') WHERE rowid = ?"),
    clear: db.prepare("UPDATE release_track_links SET youtube_url = NULL, youtube_title = NULL, yt_refreshed_at = datetime('now') WHERE rowid = ?"),
    expire: days => `UPDATE release_track_links SET youtube_url = NULL, youtube_title = NULL WHERE youtube_url LIKE '%youtu%' AND ${SRC} AND COALESCE(yt_refreshed_at, fetched_at) < datetime('now', '-${days} days')`,
    count: days => `SELECT COUNT(*) c FROM release_track_links WHERE youtube_url LIKE '%youtu%' AND ${SRC} AND COALESCE(yt_refreshed_at, fetched_at) < datetime('now', '-${days} days')`,
  },
  {
    name: 'search cache',
    stale: days => `SELECT id AS k, youtube_url AS url FROM youtube_cache WHERE youtube_url LIKE '%youtu%' AND COALESCE(yt_refreshed_at, fetched_at) < datetime('now', '-${days} days') LIMIT ?`,
    ok: db.prepare("UPDATE youtube_cache SET youtube_title = COALESCE(?, youtube_title), yt_refreshed_at = datetime('now') WHERE id = ?"),
    clear: db.prepare("UPDATE youtube_cache SET youtube_url = NULL, youtube_title = NULL, yt_refreshed_at = datetime('now') WHERE id = ?"),
    expire: days => `UPDATE youtube_cache SET youtube_url = NULL, youtube_title = NULL WHERE youtube_url LIKE '%youtu%' AND COALESCE(yt_refreshed_at, fetched_at) < datetime('now', '-${days} days')`,
    count: days => `SELECT COUNT(*) c FROM youtube_cache WHERE youtube_url LIKE '%youtu%' AND COALESCE(yt_refreshed_at, fetched_at) < datetime('now', '-${days} days')`,
  },
  {
    name: 'channel uploads',
    // Rows from before this job have no timestamp (age unknown): refreshed first, and cleared only once the job has been running 30 days.
    stale: days => `SELECT rowid AS k, 'https://www.youtube.com/watch?v=' || video_id AS url FROM yt_channel_videos WHERE yt_refreshed_at IS NULL OR yt_refreshed_at < datetime('now', '-${days} days') ORDER BY yt_refreshed_at IS NOT NULL LIMIT ?`,
    ok: db.prepare("UPDATE yt_channel_videos SET title = COALESCE(?, title), yt_refreshed_at = datetime('now') WHERE rowid = ?"),
    clear: db.prepare('DELETE FROM yt_channel_videos WHERE rowid = ?'),
    expire: days => `DELETE FROM yt_channel_videos WHERE yt_refreshed_at < datetime('now', '-${days} days') OR (yt_refreshed_at IS NULL AND ${startedLongAgo(days)})`,
    count: days => `SELECT COUNT(*) c FROM yt_channel_videos WHERE yt_refreshed_at IS NULL OR yt_refreshed_at < datetime('now', '-${days} days')`,
  },
];

// The first day this job ran, kept in api_quota (provider 'yt-refresh-start', the date as the day, so it survives restarts).
function startedLongAgo(days) {
  const row = db.prepare("SELECT MIN(day) d FROM api_quota WHERE provider = 'yt-refresh'").get();
  return row?.d && row.d < new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) ? '1' : '0';
}
const spentToday = () => db.prepare("SELECT units FROM api_quota WHERE provider = 'yt-refresh' AND day = ?").get(quotaDay())?.units || 0;
const addSpent = n => db.prepare(`INSERT INTO api_quota (provider, day, units) VALUES ('yt-refresh', ?, ?)
  ON CONFLICT(provider, day) DO UPDATE SET units = units + excluded.units`).run(quotaDay(), n);

let last = null, running = false;

// One videos.list answer for up to 50 ids -> Map(id -> { title }) for the ones that are still there, public and embeddable.
async function lookUp(ids) {
  const data = await ytApi('videos', { part: 'snippet,status', id: ids.join(','), maxResults: String(BATCH) });
  const alive = new Map();
  for (const it of data.items || []) {
    const st = it.status || {};
    if (st.privacyStatus === 'private' || st.embeddable === false || st.uploadStatus === 'rejected' || st.uploadStatus === 'deleted') continue;
    alive.set(it.id, { title: it.snippet?.title || null });
  }
  return alive;
}

export function refreshStatus() {
  const n = days => STORES.reduce((sum, s) => sum + db.prepare(s.count(days)).get().c, 0);
  return {
    due: n(REFRESH_AFTER_DAYS),             // older than 25 days: waiting for a refresh
    overdue: n(LIMIT_DAYS),                 // older than 30 days: should not exist
    unitsToday: spentToday(), unitsPerDay: DAILY_UNITS(),
    last,
  };
}

// Refresh what is due, then clear what is past the limit. { dry } only counts.
export async function runYoutubeRefresh({ dry = false } = {}) {
  if (running) return { skipped: 'already running' };
  if (dry) return { dry: true, ...refreshStatus() };
  if (!process.env.YOUTUBE_API_KEY) return { skipped: 'no YouTube API key' };
  running = true;
  const out = { at: new Date().toISOString(), refreshed: 0, cleared: 0, expired: 0, units: 0, stoppedBy: null };
  try {
    // Make sure today is on record, so "when the job started" is known even before the first unit is spent.
    db.prepare("INSERT OR IGNORE INTO api_quota (provider, day, units) VALUES ('yt-refresh', ?, 0)").run(quotaDay());
    rounds: for (;;) {
      // Up to 500 due rows per store per round, grouped by video id so a video in several places costs one lookup.
      const byId = new Map();   // id -> [{ store, k }]
      for (const store of STORES) {
        for (const r of db.prepare(store.stale(REFRESH_AFTER_DAYS)).all(500)) {
          const id = extractVideoId(r.url);
          if (!id) { store.clear.run(r.k); out.cleared++; continue; }   // not a readable YouTube link: nothing to keep
          if (!byId.has(id)) byId.set(id, []);
          byId.get(id).push({ store, k: r.k });
        }
      }
      if (!byId.size) break;
      const ids = [...byId.keys()];
      for (let i = 0; i < ids.length; i += BATCH) {
        if (spentToday() >= DAILY_UNITS()) { out.stoppedBy = 'daily refresh budget'; break rounds; }
        if (!spendQuota(1)) { out.stoppedBy = 'YouTube daily cap'; break rounds; }
        addSpent(1); out.units++;
        const batch = ids.slice(i, i + BATCH);
        const alive = await lookUp(batch);
        db.transaction(() => {
          for (const id of batch) for (const { store, k } of byId.get(id)) {
            if (alive.has(id)) { store.ok.run(alive.get(id).title, k); out.refreshed++; } else { store.clear.run(k); out.cleared++; }
          }
        })();
        await sleep(300);
      }
    }
  } catch (err) {
    out.error = err.message;
    logEvent('error', 'links', `YouTube refresh: ${err.message}`);
  } finally {
    // The hard stop: whatever is still past 30 days goes, whether or not the refresh above could run.
    try { for (const s of STORES) out.expired += db.prepare(s.expire(LIMIT_DAYS)).run().changes; } catch (err) { logEvent('error', 'links', `YouTube refresh (expiry): ${err.message}`); }
    running = false;
  }
  last = out;
  if (out.refreshed || out.cleared || out.expired || out.error) {
    logEvent(out.expired ? 'warn' : 'info', 'links',
      `YouTube refresh: ${out.refreshed} confirmed, ${out.cleared} cleared (gone or embedding off), ${out.expired} cleared for passing 30 days, ${out.units} units${out.stoppedBy ? `; stopped by ${out.stoppedBy}` : ''}`);
  }
  return out;
}

// Five minutes after start, then hourly: cheap when nothing is due (three counts), a few units when something is.
export function startYoutubeRefresh() {
  if (process.env.YT_REFRESH === '0') return;
  const tick = () => runYoutubeRefresh().catch(err => logEvent('error', 'links', `YouTube refresh: ${err.message}`));
  setTimeout(tick, 5 * 60 * 1000);
  setInterval(tick, 60 * 60 * 1000);
}
