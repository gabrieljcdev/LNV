import crypto from 'crypto';
import db from '../db/database.js';

// Favourites and shared feeds (2026-10-03) — the queries the posts route
// needs for the personal and shared feeds, kept beside the routes that own
// those tables (routes/favourites.js, routes/feeds.js).

export const FAV_KINDS = new Set(['artist', 'label', 'record']);

// An artist's or label's identity is its name, lower-cased and trimmed —
// the same grouping the drawers use, so a favourite matches every post
// that carries the name whether or not it's linked to Discogs.
export const nameKey = name => String(name || '').trim().toLowerCase();

// Posts by the artists and labels this user favourites, plus records they
// favourited straight off a card. Newest first, paged by cursor like the
// main feed (`before` = the last post id already shown).
export function personalFeedPostIds(userId, { before = null, limit = 20 } = {}) {
  return db.prepare(`
    SELECT p.id FROM posts p
    WHERE p.is_spotlight = 0
      AND (? IS NULL OR p.id < ?)
      AND (
        EXISTS (SELECT 1 FROM post_artists a JOIN favourites f
                  ON f.user_id = ? AND f.kind = 'artist' AND f.item_key = LOWER(TRIM(a.artist_name))
                WHERE a.post_id = p.id)
        OR EXISTS (SELECT 1 FROM post_labels l JOIN favourites f
                  ON f.user_id = ? AND f.kind = 'label' AND f.item_key = LOWER(TRIM(l.label_name))
                WHERE l.post_id = p.id)
        OR EXISTS (SELECT 1 FROM favourites f
                WHERE f.user_id = ? AND f.kind = 'record' AND f.post_id = p.id)
      )
    ORDER BY p.id DESC LIMIT ?
  `).all(before, before, userId, userId, userId, limit).map(r => r.id);
}

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
export const userByName = name => db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(String(name || ''));

// A wall's posts, newest first, each with its number on that wall
// (1 = the first post made on it).
export function wallPage(wallUserId, { before = null, limit = 20 } = {}) {
  return db.prepare(`
    SELECT p.id,
      (SELECT COUNT(*) FROM posts q WHERE q.wall_user_id = p.wall_user_id AND q.is_spotlight = 0 AND q.id <= p.id) AS num
    FROM posts p
    WHERE p.wall_user_id = ? AND p.is_spotlight = 0 AND (? IS NULL OR p.id < ?)
    ORDER BY p.id DESC LIMIT ?
  `).all(wallUserId, before, before, limit);
}

// Your feed (2026-10-03) — the home view once signed in: your own posts and
// the posts of everyone you follow, newest first, each numbered by its place
// in this feed (1 = the oldest in it). Followed posts are labelled on the
// cards (followedFrom).
const HOME_WHERE = `p.is_spotlight = 0 AND (p.wall_user_id = @me
  OR p.wall_user_id IN (SELECT followee_id FROM follows WHERE follower_id = @me))`;
export function homePage(userId, { before = null, limit = 20 } = {}) {
  return db.prepare(`
    SELECT p.id, p.wall_user_id,
      (SELECT COUNT(*) FROM posts p2 WHERE ${HOME_WHERE.replaceAll('p.', 'p2.')} AND p2.id <= p.id) AS num
    FROM posts p
    WHERE ${HOME_WHERE} AND (@before IS NULL OR p.id < @before)
    ORDER BY p.id DESC LIMIT @limit
  `).all({ me: userId, before, limit });
}

// 24 url-safe characters — the share link is the only key to a feed.
export const newShareToken = () => crypto.randomBytes(18).toString('base64url');
