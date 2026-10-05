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
const ENTRIES = `
  SELECT wall_user_id AS owner, id AS post_id, created_at AS at FROM posts WHERE is_spotlight = 0
  UNION ALL
  SELECT j.user_id, j.post_id, j.created_at FROM post_joins j JOIN posts p ON p.id = j.post_id AND p.is_spotlight = 0`;
function entryPage(ownerFilter, params, { before = null, limit = 20 } = {}) {
  const [bAt, bId] = before ? String(before).split('|') : [null, null];
  const rows = db.prepare(`
    WITH e AS (${ENTRIES}),
    seen AS (SELECT owner, post_id, at,
        ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY owner = @me DESC, at, owner) AS rn
      FROM e WHERE ${ownerFilter}),
    feed AS (SELECT owner, post_id, at, ROW_NUMBER() OVER (ORDER BY at, post_id) AS num FROM seen WHERE rn = 1)
    SELECT post_id AS id, owner AS wall_user_id, at, num FROM feed
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

// How many posts are on a wall (made or joined) and when the latest went up.
export function wallStats(userId) {
  return db.prepare(`WITH e AS (${ENTRIES}) SELECT COUNT(DISTINCT post_id) AS post_count, MAX(at) AS latest FROM e WHERE owner = ?`).get(userId);
}

// 24 url-safe characters — the share link is the only key to a feed.
export const newShareToken = () => crypto.randomBytes(18).toString('base64url');
