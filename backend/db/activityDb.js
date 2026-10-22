// The activity database (2026-10-12): a SECOND SQLite file, separate from vinyl_crate.db, for what people DO on the
// site — they posted, kept, highlighted, replied (and, later, played, skipped, added to a playlist). Decided 10 Oct
// (gabriel): the music / catalogue database gets huge and hard to maintain, so activity data starts in its own file,
// is backed up on its own (deploy/backup.sh) and can be restored, exported or cleared without touching the music.
//
// What goes where:
//   vinyl_crate.db  the content itself and what a card must show quickly (posts, joins, comments, highlights, and the
//                   `origin` / `origin_ref` of a post or a keep — "found digging", "found from <person>", "outside link").
//   activity.db     one append-only row per act, for rollups, introductions and the opt-in research programme.
//
// Rules for this file: never put post text or reply text in it (ids and short labels only); a failed write here must
// never break the action the person took (recordEvent swallows errors); nothing in here steers what plays — it only
// feeds who is introduced to whom (see "the on-site algorithm only connects people").
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Next to the music database (on the server both live in /var/lib/lnv), or LNV_ACTIVITY_DB_PATH.
const ACTIVITY_PATH = process.env.LNV_ACTIVITY_DB_PATH
  || (process.env.LNV_DB_PATH ? join(dirname(process.env.LNV_DB_PATH), 'activity.db') : join(__dirname, 'activity.db'));

const activity = new Database(ACTIVITY_PATH);
activity.pragma('journal_mode = WAL');
activity.pragma('synchronous = NORMAL');

activity.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (datetime('now')),   -- UTC, like the music database
    user_id INTEGER NOT NULL,                     -- who did it (users.id in vinyl_crate.db)
    kind TEXT NOT NULL,                           -- post | unpost | keep | unkeep | highlight | unhighlight | reply
    post_id INTEGER,                              -- posts.id in vinyl_crate.db
    track_id INTEGER,                             -- post_tracks.id, when the act was about one track
    origin TEXT,                                  -- digging | user | link (how the record reached the person)
    origin_ref TEXT,                              -- the drawer / playlist name, or the username it came from
    meta TEXT                                     -- small JSON, e.g. {"private":true}; never post or reply text
  );
  CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, at);
  CREATE INDEX IF NOT EXISTS idx_events_post ON events(post_id, at);
  CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, at);
`);

// Listening history (2026-10-22): what a person played, finished or skipped, and where from. Private to the account, recorded only
// for people who turned "keep my listening history" on (user_prefs, off by default), and theirs to see, export and clear.
for (const col of ['source TEXT', 'place TEXT', 'ms_played INTEGER']) { try { activity.exec(`ALTER TABLE events ADD COLUMN ${col}`); } catch { /* already there */ } }
activity.exec(`
  CREATE TABLE IF NOT EXISTS user_prefs (
    user_id INTEGER PRIMARY KEY,
    keep_listening INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
export const LISTEN_KINDS = ['play', 'finish', 'skip'];
// Old listening rows are rolled off after this long (the other acts are kept: they are on the posts anyway).
export const LISTENING_KEEP_DAYS = 400;
activity.prepare(`DELETE FROM events WHERE kind IN ('play', 'finish', 'skip') AND at < datetime('now', '-${LISTENING_KEEP_DAYS} days')`).run();

const ORIGINS = new Set(['digging', 'user', 'link']);
/** Tidy an origin pair from a request body: a known origin (default 'link') and a short reference, or nulls. */
export function cleanOrigin(origin, ref) {
  const o = ORIGINS.has(origin) ? origin : null;
  const r = String(ref ?? '').trim().slice(0, 120) || null;
  return { origin: o, origin_ref: o ? r : null };
}

const insert = activity.prepare('INSERT INTO events (user_id, kind, post_id, track_id, origin, origin_ref, meta) VALUES (?, ?, ?, ?, ?, ?, ?)');
/** Append one act. Never throws: losing an event must not lose the post, keep or reply it was about. */
export function recordEvent(kind, { userId, postId = null, trackId = null, origin = null, originRef = null, meta = null }) {
  try {
    if (!userId) return;
    insert.run(userId, kind, postId, trackId, origin, originRef, meta ? JSON.stringify(meta) : null);
  } catch (err) { console.warn('[activity] could not record', kind, err.message); }
}

/** For the Admin / backup checks: how big the file is in rows. */
export function activityCounts() {
  return activity.prepare('SELECT kind, COUNT(*) AS n FROM events GROUP BY kind ORDER BY n DESC').all();
}

export { ACTIVITY_PATH };
export default activity;
