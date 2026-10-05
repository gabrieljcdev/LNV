import crypto from 'crypto';
import db from '../db/database.js';

// Walls, my feed, playlists and shared feeds (2026-10-03) — the queries the posts route
// needs for those feeds, kept beside the routes that own
// those tables (routes/walls.js, routes/playlists.js, routes/feeds.js).

export function memberRole(feedId, userId) {
  if (!userId) return null;
  return db.prepare('SELECT role FROM shared_feed_members WHERE feed_id = ? AND user_id = ?').get(feedId, userId)?.role || null;
}

// A shared feed's posts, newest post first, same cursor paging.
export function sharedFeedPostIds(feedId, { before = null, limit = 20 } = {}) {
  return db.prepare(`
    SELECT i.post_id AS id FROM shared_feed_items i JOIN posts p ON p.id = i.post_id
    WHERE i.feed_id = ? AND (? IS NULL OR i.post_id < ?)
    ORDER BY i.post_id DESC LIMIT ?
  `).all(feedId, before, before, limit).map(r => r.id);
}

// Who put each post into the shared feed, for the cards' "added by".
export function sharedFeedAdders(feedId, postIds) {
  if (!postIds.length) return new Map();
  const rows = db.prepare(`
    SELECT i.post_id, u.username, i.added_at FROM shared_feed_items i JOIN users u ON u.id = i.added_by
    WHERE i.feed_id = ? AND i.post_id IN (${postIds.map(() => '?').join(',')})
  `).all(feedId, ...postIds);
  return new Map(rows.map(r => [r.post_id, { username: r.username, added_at: r.added_at }]));
}

// A shared feed's posts in the order they were added, newest first, with
// each one's number in that feed (1 = the first one added). `before` is the
// item id the last page ended on. Replaces sharedFeedPostIds for listing.
export function sharedFeedPage(feedId, { before = null, limit = 20 } = {}) {
  return db.prepare(`
    SELECT i.id AS item_id, i.post_id AS id,
      (SELECT COUNT(*) FROM shared_feed_items j WHERE j.feed_id = i.feed_id AND j.id <= i.id) AS num
    FROM shared_feed_items i JOIN posts p ON p.id = i.post_id
    WHERE i.feed_id = ? AND (? IS NULL OR i.id < ?)
    ORDER BY i.id DESC LIMIT ?
  `).all(feedId, before, before, limit);
}

// ── walls ─────────────────────────────────────────────────────────────────────
// Case-insensitive, as sign-up keeps names unique that way — but an exact
// match first (2026-10-05): older test accounts "ADMIN" and "admin" coexist.
export const userByName = name => db.prepare('SELECT id, username FROM users WHERE username = @n COLLATE NOCASE ORDER BY username = @n DESC LIMIT 1').get({ n: String(name || '') });

// Walls and my feed are made of entries: a post on its poster's wall, plus
// one for each person who joined it ("also posted by", post_joins) — on the
// joiner's wall, at the time they joined (2026-10-04). A post reached more
// than once in a feed shows once, at its first entry (your own first).
// Paged by cursor "<at>|<post id>" (where the next page starts); each row
// carries its number in that feed (1 = the oldest) and whose entry it is.
// `kind`: 'post' (made it), 'also' (posted it too) or 'repost'.
const ENTRIES = `
  SELECT wall_user_id AS owner, id AS post_id, created_at AS at, 'post' AS kind FROM posts WHERE is_spotlight = 0
  UNION ALL
  SELECT j.user_id, j.post_id, j.created_at, j.kind FROM post_joins j JOIN posts p ON p.id = j.post_id AND p.is_spotlight = 0`;
function entryPage(ownerFilter, params, { before = null, limit = 20 } = {}) {
  const [bAt, bId] = before ? String(before).split('|') : [null, null];
  const rows = db.prepare(`
    WITH e AS (${ENTRIES}),
    seen AS (SELECT owner, post_id, at, kind,
        ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY owner = @me DESC, at, owner) AS rn
      FROM e WHERE ${ownerFilter}),
    feed AS (SELECT owner, post_id, at, kind, ROW_NUMBER() OVER (ORDER BY at, post_id) AS num FROM seen WHERE rn = 1)
    SELECT post_id AS id, owner AS wall_user_id, at, kind, num FROM feed
    WHERE @bAt IS NULL OR at < @bAt OR (at = @bAt AND post_id < @bId)
    ORDER BY at DESC, post_id DESC LIMIT @limit
  `).all({ me: null, ...params, bAt: bAt || null, bId: Number(bId) || 0, limit });
  return rows.map(r => ({ ...r, cursor: `${r.at}|${r.id}` }));
}

// A wall: the posts its owner made or joined, newest first.
export const wallPage = (wallUserId, opts) => entryPage('owner = @wall', { wall: wallUserId }, opts);

// Your feed (2026-10-03) — the home view once signed in: your own posts and
// the posts of everyone you follow (and what they joined), newest first.
// Followed posts are labelled on the cards (followedFrom).
export const homePage = (userId, opts) => entryPage(
  'owner = @me OR owner IN (SELECT followee_id FROM follows WHERE follower_id = @me)', { me: userId }, opts);

// In common (alpha, 2026-10-05): what two people both post — the same
// records, artists and labels — from what they chose to post themselves
// (their posts + "post it too"; not reposts). Fixed, explainable rules, no
// learning and no engagement signals: an artist or label counts for more the
// fewer people post it (Basic Channel says more than Columbia), so lists are
// rarest first. "Various" is never an artist.
const THEIRS = `
  SELECT wall_user_id AS u, id AS p FROM posts WHERE is_spotlight = 0
  UNION SELECT user_id, post_id FROM post_joins WHERE kind = 'also'`;
function sharedNames(table, idCol, nameCol, a, b, limit) {
  const rows = db.prepare(`
    WITH theirs AS (${THEIRS}),
    x AS (SELECT DISTINCT t.u, COALESCE('id:' || n.${idCol}, 'n:' || lower(n.${nameCol})) AS k, n.${nameCol} AS name
      FROM theirs t JOIN ${table} n ON n.post_id = t.p
      WHERE lower(trim(n.${nameCol})) NOT IN ('various', 'various artists'))
    SELECT k, MIN(name) AS name, COUNT(DISTINCT u) AS posters FROM x
    WHERE k IN (SELECT k FROM x WHERE u = @a) AND k IN (SELECT k FROM x WHERE u = @b)
    GROUP BY k ORDER BY posters, name
  `).all({ a, b });
  return { total: rows.length, items: rows.slice(0, limit).map(r => ({ name: r.name, posters: r.posters })) };
}
export function inCommon(a, b) {
  const records = db.prepare(`
    WITH theirs AS (${THEIRS})
    SELECT p.id, p.title, p.thumb_image, p.cover_image FROM posts p
    WHERE p.id IN (SELECT p FROM theirs WHERE u = @a) AND p.id IN (SELECT p FROM theirs WHERE u = @b)
    ORDER BY p.id DESC
  `).all({ a, b });
  return {
    artists: sharedNames('post_artists', 'discogs_artist_id', 'artist_name', a, b, 8),
    labels: sharedNames('post_labels', 'discogs_label_id', 'label_name', a, b, 8),
    records: { total: records.length, items: records.slice(0, 6).map(r => ({ id: r.id, title: r.title, cover: r.thumb_image || r.cover_image || null })) },
  };
}

// How many posts are on a wall (made or joined) and when the latest went up.
export function wallStats(userId) {
  return db.prepare(`WITH e AS (${ENTRIES}) SELECT COUNT(DISTINCT post_id) AS post_count, MAX(at) AS latest FROM e WHERE owner = ?`).get(userId);
}

// 24 url-safe characters — the share link is the only key to a feed.
export const newShareToken = () => crypto.randomBytes(18).toString('base64url');
