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
  // Per-provider daily API spend, so paid-by-quota calls (YouTube
  // search.list = 100 units each) can be capped below the provider's own
  // limit. See youtubeService's spendQuota.
  // When discogsMatcher last tried (and failed) to find this post's release,
  // so unmatched posts are retried daily rather than on every sweep.
  'ALTER TABLE posts ADD COLUMN discogs_checked_at TEXT',
  // YouTube link per Discogs release track, saved the first time one is
  // found (spotlight track click, compose's track search). youtube_url NULL
  // = searched, nothing found — retried after 14 days. Keyed by release +
  // position so a spotlight can show every known link the moment a release
  // opens. Precursor to the catalogue's tracks/entity_links tables.
  `CREATE TABLE IF NOT EXISTS release_track_links (
    release_id INTEGER NOT NULL,
    position TEXT NOT NULL,
    title TEXT,
    youtube_url TEXT,
    youtube_title TEXT,
    source TEXT,
    fetched_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (release_id, position)
  )`,
  `CREATE TABLE IF NOT EXISTS api_quota (
    provider TEXT NOT NULL,
    day TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, day)
  )`,
  // The poster's own headline for a post (shown above its description on
  // the feed cards) — separate from `title`, the record's title.
  'ALTER TABLE posts ADD COLUMN post_title TEXT',
  // A track's own player (2026-10-02): Bandcamp tracks can't be embedded
  // from their page URL — the player needs the track id.
  'ALTER TABLE post_tracks ADD COLUMN embed_url TEXT',
  // Channel crawler (2026-10-02): every upload of a spotlighted YouTube
  // channel, collected 50 per request (1 quota unit) in the background.
  // next_page = where the backfill resumes; backfill_done once the oldest
  // upload is in; refreshed_at = last check for new uploads.
  `CREATE TABLE IF NOT EXISTS yt_channels (
    channel_id TEXT PRIMARY KEY,
    uploads_id TEXT NOT NULL,
    title TEXT,
    thumb TEXT,
    total INTEGER,
    next_page TEXT,
    backfill_done INTEGER NOT NULL DEFAULT 0,
    refreshed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS yt_channel_videos (
    video_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    title TEXT,
    published_at TEXT,
    thumb TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_yt_channel_videos ON yt_channel_videos(channel_id, published_at)',
  // Catalogue crawler (2026-10-02): a label's / artist's whole Discogs
  // release list, collected page by page for the spotlight (discogsService
  // getCataloguePage). One row per release or master; roles merged.
  `CREATE TABLE IF NOT EXISTS discogs_catalogue (
    kind TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    title TEXT,
    year INTEGER,
    role TEXT,
    thumb TEXT,
    artist TEXT,
    label TEXT,
    format TEXT,
    catno TEXT,
    main_release INTEGER,
    PRIMARY KEY (kind, entity_id, item_type, item_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_discogs_catalogue_year ON discogs_catalogue(kind, entity_id, year)',
  `CREATE TABLE IF NOT EXISTS discogs_catalogue_crawl (
    kind TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    total INTEGER,
    pages INTEGER,
    next_page INTEGER NOT NULL DEFAULT 1,
    done INTEGER NOT NULL DEFAULT 0,
    crawled_at TEXT,
    PRIMARY KEY (kind, entity_id)
  )`,
  // Shared feeds (2026-10-03): a feed of posts a few friends put together.
  // Joining is by the feed's share link (share_token); members add posts.
  `CREATE TABLE IF NOT EXISTS shared_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    share_token TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS shared_feed_members (
    feed_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (feed_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS shared_feed_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    added_by INTEGER NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE (feed_id, post_id)
  )`,
  // Walls (2026-10-03): every user's public profile feed. A post lands on
  // the wall of whoever posted it, or on a friend's wall they've been
  // invited to post on (wall_writers, joined through walls.invite_token).
  // Every post still shows on the main feed.
  'ALTER TABLE posts ADD COLUMN wall_user_id INTEGER',
  'UPDATE posts SET wall_user_id = user_id WHERE wall_user_id IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_posts_wall ON posts(wall_user_id, id)',
  `CREATE TABLE IF NOT EXISTS walls (
    user_id INTEGER PRIMARY KEY,
    invite_token TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS wall_writers (
    wall_user_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (wall_user_id, user_id)
  )`,
  // Playlists (2026-10-03): your own lists of tracks, picked from posts.
  // A track keeps its own copy of title / link so it survives edits.
  `CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    post_id INTEGER,
    position TEXT,
    title TEXT NOT NULL,
    artist TEXT,
    url TEXT NOT NULL,
    embed_url TEXT,
    duration TEXT,
    cover TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(playlist_id, sort)',
  // Following (2026-10-03): follow another user to keep their wall a click
  // away.
  `CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    followee_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, followee_id)
  )`,
  // Shared playlists (2026-10-03): readable by anyone with the share link,
  // editable by friends who joined with the invite link (playlist_members).
  // kind 'hearted' = the list your track hearts go into (one per user).
  "ALTER TABLE playlists ADD COLUMN kind TEXT NOT NULL DEFAULT 'list'",
  'ALTER TABLE playlists ADD COLUMN share_token TEXT',
  'ALTER TABLE playlists ADD COLUMN invite_token TEXT',
  `CREATE TABLE IF NOT EXISTS playlist_members (
    playlist_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (playlist_id, user_id)
  )`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists — skip */ }
}

console.log('✅ Database initialised at', DB_PATH);

export default db;
