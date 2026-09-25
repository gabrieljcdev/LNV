import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'vinyl_crate.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    discogs_id INTEGER UNIQUE,
    discogs_type TEXT DEFAULT 'release',
    title TEXT NOT NULL,
    year INTEGER,
    country TEXT,
    cover_image TEXT,
    thumb_image TEXT,
    notes TEXT,
    discogs_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS post_artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    artist_name TEXT NOT NULL,
    discogs_artist_id INTEGER,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS post_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    label_name TEXT NOT NULL,
    catalogue_number TEXT,
    discogs_label_id INTEGER,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS post_genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    genre TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS post_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    position TEXT,
    title TEXT NOT NULL,
    duration TEXT,
    youtube_url TEXT,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS youtube_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT UNIQUE NOT NULL,
    youtube_url TEXT,
    youtube_title TEXT,
    fetched_at TEXT DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO users (id, username, display_name, bio)
  VALUES (1, 'lnv_admin', 'Late Night Vibes', 'Curator of the late night crate.');
`);


// Migrations — safe to run on every boot, silently skip if column exists
const migrations = [
  'ALTER TABLE posts ADD COLUMN stream_url TEXT',
  'ALTER TABLE posts ADD COLUMN embed_url TEXT',
  'ALTER TABLE posts ADD COLUMN platform TEXT',
  'ALTER TABLE posts ADD COLUMN post_type TEXT DEFAULT \'album\'',
  'ALTER TABLE post_tracks ADD COLUMN stream_url TEXT',
  `CREATE TABLE IF NOT EXISTS discogs_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now'))
  )`,
  // Rescope: crates/playlisting and walls (a second, near-identical collections
  // feature) are cut — this app is a blog-like feed now, no community layer.
  // Drops run once per table (IF EXISTS makes repeats a no-op on later boots).
  'DROP TABLE IF EXISTS crate_invites',
  'DROP TABLE IF EXISTS crate_tracks',
  'DROP TABLE IF EXISTS crate_comments',
  'DROP TABLE IF EXISTS crate_collaborators',
  'DROP TABLE IF EXISTS crate_activity',
  'DROP TABLE IF EXISTS crate_follows',
  'DROP TABLE IF EXISTS crate_likes',
  'DROP TABLE IF EXISTS crate_records',
  'DROP TABLE IF EXISTS crates',
  'DROP TABLE IF EXISTS wall_posts',
  'DROP TABLE IF EXISTS wall_members',
  'DROP TABLE IF EXISTS walls',
  // Rescope: netlink was a separate community-board data model running
  // alongside posts/comments. The feed already reads/writes posts/comments
  // directly (confirmed dead: useFeedPosts.js and ComposeModal's netlink
  // dual-write, both removed) — netlink_comments dropped first since it
  // has a FK to netlink_posts.
  'DROP TABLE IF EXISTS netlink_comments',
  'DROP TABLE IF EXISTS netlink_posts',
  // Spotlights: auto-posted editorial cards for an artist/genre/label once
  // it crosses a post-count milestone. Additive only — nothing reads or
  // writes these yet (wired up in the spotlight-trigger phase).
  'ALTER TABLE posts ADD COLUMN is_spotlight INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE posts ADD COLUMN spotlight_subject TEXT',
  `CREATE TABLE IF NOT EXISTS spotlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_type TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    post_count_at_trigger INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  )`,
  // Live-set channel/venue (e.g. "Boiler Room", "HÖR"). ComposeModal has
  // always had the CHANNEL / VENUE field and sent it on POST /posts, and
  // media.js's YouTube-title parser has always returned one to prefill it —
  // but posts had no column to land in, so it was silently dropped on every
  // save. That's why PostCard's Channel box (and now the channel spotlight)
  // read empty: not a rendering bug, a missing column.
  'ALTER TABLE posts ADD COLUMN channel TEXT',
  // Channel spotlights need a back catalogue the same way artist and label
  // spotlights use a Discogs discography — but a channel isn't a Discogs
  // entity, so theirs comes from the YouTube Data API instead (see
  // youtubeService's getChannelUploads). Cached here rather than in
  // youtube_cache, which is a fixed url/title pair table and can't hold a
  // JSON payload. Short TTL: channels keep uploading.
  `CREATE TABLE IF NOT EXISTS youtube_channel_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now'))
  )`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists — skip */ }
}

console.log('✅ Database initialised at', DB_PATH);

export default db;
