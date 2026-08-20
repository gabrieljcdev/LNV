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

  CREATE TABLE IF NOT EXISTS netlink_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL DEFAULT 'NO SUBJECT',
    body TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    post_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS netlink_comments (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    netlink_post_id  INTEGER NOT NULL,
    user_id          INTEGER NOT NULL,
    body             TEXT NOT NULL,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (netlink_post_id) REFERENCES netlink_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)         REFERENCES users(id)
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

  CREATE TABLE IF NOT EXISTS walls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 1,
    cover_image TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wall_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wall_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'viewer',
    FOREIGN KEY (wall_id) REFERENCES walls(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wall_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wall_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (wall_id) REFERENCES walls(id) ON DELETE CASCADE,
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

  CREATE TABLE IF NOT EXISTS crates (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    name         TEXT    NOT NULL,
    description  TEXT    DEFAULT '',
    is_public    INTEGER DEFAULT 0,
    is_pinned    INTEGER DEFAULT 0,
    created_at   TEXT    DEFAULT (datetime('now')),
    updated_at   TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS crate_records (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id  INTEGER NOT NULL,
    post_id   INTEGER NOT NULL,
    added_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id)  REFERENCES posts(id)  ON DELETE CASCADE,
    UNIQUE(crate_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS crate_likes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id  INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    liked_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id) ON DELETE CASCADE,
    UNIQUE(crate_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS crate_follows (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id     INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    followed_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id) ON DELETE CASCADE,
    UNIQUE(crate_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS crate_activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id   INTEGER NOT NULL,
    user_id    INTEGER,
    event_type TEXT NOT NULL,
    detail     TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS crate_collaborators (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    invited_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id) ON DELETE CASCADE,
    UNIQUE(crate_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS crate_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id   INTEGER NOT NULL,
    post_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id)  REFERENCES posts(id)  ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS crate_tracks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id   INTEGER NOT NULL,
    track_id   INTEGER NOT NULL,
    added_at   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id)      ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES post_tracks(id) ON DELETE CASCADE,
    UNIQUE(crate_id, track_id)
  );
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
  // Crate enhancements
  'ALTER TABLE crates ADD COLUMN cover_image TEXT',
  'ALTER TABLE crates ADD COLUMN slug TEXT',
  'ALTER TABLE crate_collaborators ADD COLUMN role TEXT DEFAULT \'contributor\'',
  'ALTER TABLE crate_collaborators ADD COLUMN status TEXT DEFAULT \'accepted\'',
  'ALTER TABLE crate_collaborators ADD COLUMN invited_by INTEGER',
  // Invite tokens for shareable invite links
  `CREATE TABLE IF NOT EXISTS crate_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    role TEXT DEFAULT 'contributor',
    uses INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT NULL,
    expires_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (crate_id) REFERENCES crates(id) ON DELETE CASCADE
  )`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists — skip */ }
}

console.log('✅ Database initialised at', DB_PATH);

export default db;
