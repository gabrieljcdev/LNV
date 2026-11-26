// Links flagged as WRONG (2026-10-22): they play, but they are not the track. Kept so the same wrong link is never handed out again.
// The table and the guard live here, apart from the logic (services/badLinks.js), so the YouTube search can ask "is this flagged?"
// without importing the code that imports it.
//
// A flag is for one track: (release_id, position). The same video can be right for another track. `cache_key` is the search key of
// that track (artist + title, as youtubeService.searchTrackVideo keys its cache) so a later YouTube SEARCH for it skips the video too.
import db from '../db/database.js';

db.exec(`CREATE TABLE IF NOT EXISTS bad_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  release_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  cache_key TEXT,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'reported',   -- reported (some people said wrong) | flagged (never handed out again)
  reports INTEGER NOT NULL DEFAULT 0,
  flagged_by TEXT,                           -- admin | reports | replaced
  created_at TEXT DEFAULT (datetime('now')),
  flagged_at TEXT,
  UNIQUE (url, release_id, position)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS bad_link_reports (
  bad_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bad_id, user_id)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_bad_links_key ON bad_links(cache_key, status)');

try { db.exec('ALTER TABLE release_track_links ADD COLUMN spotify_url TEXT'); } catch { /* already there (releaseSpotify.js adds it too) */ }

// Whatever writes release_track_links (the YouTube search, the Discogs videos, the spare-quota job, the MusicBrainz and Spotify
// finders), a flagged link for that track is quietly dropped at the door: RAISE(IGNORE) skips the row.
const GUARD = `EXISTS (SELECT 1 FROM bad_links b WHERE b.status = 'flagged' AND b.release_id = NEW.release_id AND b.position = NEW.position
                 AND b.url IN (COALESCE(NEW.youtube_url, ''), COALESCE(NEW.spotify_url, '')))`;
for (const when of ['INSERT', 'UPDATE']) {
  db.exec(`DROP TRIGGER IF EXISTS rtl_skip_bad_${when.toLowerCase()}`);
  db.exec(`CREATE TRIGGER rtl_skip_bad_${when.toLowerCase()} BEFORE ${when} ON release_track_links WHEN ${GUARD} BEGIN SELECT RAISE(IGNORE); END`);
}

const byKey = db.prepare("SELECT 1 FROM bad_links WHERE status = 'flagged' AND cache_key = ? AND url = ? LIMIT 1");
// Used by the YouTube search: has this video been flagged as the wrong one for this search?
export const flaggedForSearch = (cacheKey, url) => !!cacheKey && !!url && !!byKey.get(cacheKey, url);
const byTrack = db.prepare("SELECT 1 FROM bad_links WHERE status = 'flagged' AND release_id = ? AND position = ? AND url = ? LIMIT 1");
export const flaggedForTrack = (releaseId, position, url) => !!url && !!byTrack.get(releaseId, String(position), url);
