import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.LNV_DB_PATH || join(__dirname, 'vinyl_crate.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
// Tuned for a database that grows to tens of millions of catalogue rows
// (2026-10-07). synchronous NORMAL is safe in WAL mode (a power cut can lose the
// last moments, never corrupt the file); a 128 MB page cache and memory-mapped
// reads keep the hot parts of the indexes in RAM; the WAL is trimmed back
// after big crawl bursts instead of staying large.
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -131072');          // 128 MB (was 16 MB)
db.pragma('mmap_size = 1073741824');        // read up to 1 GB through the OS page cache
db.pragma('journal_size_limit = 67108864'); // WAL file shrinks back to 64 MB
db.pragma('wal_autocheckpoint = 4000');

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
  // A track's own artist (2026-10-08): compilations credit each track to someone
  // other than the release artist ("Various"). Shown bold and linked on the card.
  'ALTER TABLE post_tracks ADD COLUMN artist TEXT',
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
  // The order the lists are shown in (newest year first, undated last, then
  // title) — without it every page re-sorted the whole label (Polydor, deep
  // in: 1.2 s; with it, ~0.1 s). 2026-10-07.
  'CREATE INDEX IF NOT EXISTS idx_catalogue_page ON discogs_catalogue(kind, entity_id, (year IS NULL), year DESC, title)',
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
  // kind 'hearted' was the list track hearts went into, until hearts moved
  // to records (2026-10-06); those lists are ordinary playlists now.
  "ALTER TABLE playlists ADD COLUMN kind TEXT NOT NULL DEFAULT 'list'",
  'ALTER TABLE playlists ADD COLUMN share_token TEXT',
  'ALTER TABLE playlists ADD COLUMN invite_token TEXT',
  `CREATE TABLE IF NOT EXISTS playlist_members (
    playlist_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (playlist_id, user_id)
  )`,
  // Also posted by (2026-10-04): there's one post per release, so posting a
  // record that's already up joins its post instead — it goes on your wall
  // and into your followers' feeds, and the card says "also posted by you".
  `CREATE TABLE IF NOT EXISTS post_joins (
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (post_id, user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_post_joins_user ON post_joins(user_id)',
  // Profiles (2026-10-05): up to 3 labels a user pins as favourites, and the
  // playlists they choose to show (shown = readable by its share link).
  `CREATE TABLE IF NOT EXISTS profile_pins (
    user_id INTEGER NOT NULL,
    label_name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, label_name)
  )`,
  'ALTER TABLE playlists ADD COLUMN on_profile INTEGER NOT NULL DEFAULT 0',
  // Favourites (2026-10-06): ♥ by an artist's, label's or channel's name —
  // three lists, shown on your profile. `name_key` (lower-cased) is the
  // identity, as the drawers group names. Pinned labels became favourites.
  // (`favourite_names`: the name `favourites` belonged to a dropped feature,
  // whose table is removed here.)
  'DROP TABLE IF EXISTS favourites',
  `CREATE TABLE IF NOT EXISTS favourite_names (
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, kind, name_key)
  )`,
  "INSERT OR IGNORE INTO favourite_names (user_id, kind, name, name_key) SELECT user_id, 'label', label_name, lower(trim(label_name)) FROM profile_pins",
  'DELETE FROM profile_pins',
  // Reposts (2026-10-05): a join is either "also posted" (you have the
  // record too) or a repost (you're sharing someone's post — the card says
  // "↻ you" in your followers' feeds). Same wall / feed entries either way.
  "ALTER TABLE post_joins ADD COLUMN kind TEXT NOT NULL DEFAULT 'also'",
  // The heart (2026-10-06): reposts and "post it too" became one act — ♥ a
  // record and it's on your wall. Old reposts count as hearts.
  "UPDATE post_joins SET kind = 'also' WHERE kind = 'repost'",
  // Track hearts are gone (2026-10-06): a "Hearted tracks" list is an
  // ordinary playlist now (same name and tracks, renamable, deletable).
  "UPDATE playlists SET kind = 'list' WHERE kind = 'hearted'",
  // Introductions (alpha, 2026-10-05): now and then my feed introduces
  // someone to follow (collectionsService introductionsFor). You can turn
  // them off, say no to a person for good (×), and every one shown is
  // logged — with its reason — for the admin view.
  'ALTER TABLE users ADD COLUMN intros_off INTEGER NOT NULL DEFAULT 0',
  `CREATE TABLE IF NOT EXISTS intro_dismissals (
    user_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, target_id)
  )`,
  `CREATE TABLE IF NOT EXISTS intro_shown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT,
    shown_at TEXT DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_intro_shown_viewer ON intro_shown(viewer_id, target_id)',
  'CREATE INDEX IF NOT EXISTS idx_intro_shown_target ON intro_shown(target_id, shown_at)',
  // Proper channels (2026-10-05): only established channels can be ♥'d,
  // judged from YouTube's own numbers (youtubeService channelVerdict) —
  // subscribers (can be hidden), when the channel started, its @handle —
  // fetched with the channel (no extra quota) or in batches of 50 (1 unit).
  // channel_status: an admin's say-so by channel name, over the numbers.
  'ALTER TABLE yt_channels ADD COLUMN subscribers INTEGER',
  'ALTER TABLE yt_channels ADD COLUMN subs_hidden INTEGER',
  'ALTER TABLE yt_channels ADD COLUMN started_at TEXT',
  'ALTER TABLE yt_channels ADD COLUMN handle TEXT',
  'ALTER TABLE yt_channels ADD COLUMN stats_at TEXT',
  // The default playlist (2026-10-06, gabriel): everyone has one — "My
  // playlist" — that + on a track fills while it's your only playlist. It
  // can be renamed, not deleted. The old "Hearted tracks" lists become it.
  'ALTER TABLE playlists ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0',
  `UPDATE playlists SET is_default = 1, name = 'My playlist' WHERE name = 'Hearted tracks'
     AND id = (SELECT MIN(id) FROM playlists p2 WHERE p2.owner_id = playlists.owner_id AND p2.name = 'Hearted tracks')
     AND NOT EXISTS (SELECT 1 FROM playlists p3 WHERE p3.owner_id = playlists.owner_id AND p3.is_default = 1)`,
  // Every playlist public for now (2026-10-06, gabriel: privacy later):
  // shown on its owner's profile and readable by its share link. Not the Discogs
  // collection / wantlist lists (2026-10-09): those are private to their owner.
  "UPDATE playlists SET on_profile = 1 WHERE on_profile = 0 AND kind NOT IN ('collection', 'wantlist')",
  "UPDATE playlists SET share_token = lower(hex(randomblob(18))) WHERE share_token IS NULL AND kind NOT IN ('collection', 'wantlist')",
  `CREATE TABLE IF NOT EXISTS channel_status (
    name_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    official INTEGER NOT NULL,
    set_at TEXT DEFAULT (datetime('now'))
  )`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists — skip */ }
}

console.log('✅ Database initialised at', DB_PATH);

export default db;
