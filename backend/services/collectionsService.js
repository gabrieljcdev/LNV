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
// `kind`: 'post' (made it) or 'also' (♥'d it onto their wall).
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
// (their posts + the records they ♥'d). Fixed, explainable rules, no
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

// Introductions (alpha, 2026-10-05): people my feed suggests you follow.
// Fixed rules, written out on the About page — no learning, no engagement
// signals, and they never reorder the feed (the client slots them in, at
// most one in eight cards). Two kinds of reason:
// - social: people you follow who follow them;
// - musical: the artists, labels and records you both chose to post, the
//   rarer the stronger (as inCommon: 1 / how many people post the name).
// Someone qualifies with at least INTRO_MIN_POSTS posts, when a reason is
// strong (two people you follow, or one plus something in common, or
// enough in common on its own), and isn't followed, said no to (×), shown
// to you in the last INTRO_RESHOW_DAYS, or already introduced to
// INTRO_WEEK_CAP people this week.
export const INTRO_MIN_POSTS = 5;
export const INTRO_WEEK_CAP = 20;
const INTRO_RESHOW_DAYS = 14, INTRO_MAX = 3;
export function introductionsFor(viewerId) {
  if (db.prepare('SELECT intros_off FROM users WHERE id = ?').get(viewerId)?.intros_off) return { off: true, items: [] };
  const candidates = db.prepare(`
    SELECT u.id, u.username, u.bio, u.created_at FROM users u
    WHERE u.id <> @me
      AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = @me)
      AND u.id NOT IN (SELECT target_id FROM intro_dismissals WHERE user_id = @me)
      AND u.id NOT IN (SELECT target_id FROM intro_shown WHERE viewer_id = @me AND shown_at > datetime('now', @reshow))
      AND (SELECT COUNT(DISTINCT viewer_id) FROM intro_shown WHERE target_id = u.id AND shown_at > datetime('now', '-7 days')) < @cap
  `).all({ me: viewerId, reshow: `-${INTRO_RESHOW_DAYS} days`, cap: INTRO_WEEK_CAP })
    .filter(u => wallStats(u.id).post_count >= INTRO_MIN_POSTS);
  const via = db.prepare(`SELECT u.username FROM follows a JOIN follows b ON b.follower_id = a.followee_id JOIN users u ON u.id = a.followee_id
    WHERE a.follower_id = ? AND b.followee_id = ? ORDER BY u.username`);
  const scored = [];
  for (const u of candidates) {
    const social = via.all(viewerId, u.id).map(r => r.username);
    const common = inCommon(viewerId, u.id);
    const names = [...common.labels.items, ...common.artists.items].sort((a, b) => a.posters - b.posters);
    const musical = names.reduce((s, n) => s + 1 / n.posters, 0) + common.records.total * 0.5;
    const strong = social.length >= 2 || (social.length >= 1 && musical > 0) || musical >= 1;
    if (!strong) continue;
    scored.push({ u, social, names, records: common.records.total, nameTotal: common.labels.total + common.artists.total, score: social.length + musical });
  }
  scored.sort((a, b) => b.score - a.score);
  const latest = db.prepare(`WITH e AS (${ENTRIES}) SELECT p.id, p.title, p.thumb_image, p.cover_image FROM e JOIN posts p ON p.id = e.post_id
    WHERE e.owner = ? ORDER BY e.at DESC LIMIT 3`);
  return {
    off: false,
    items: scored.slice(0, INTRO_MAX).map(({ u, social, names, records, nameTotal }) => ({
      username: u.username, bio: u.bio || '', member_since: u.created_at,
      post_count: wallStats(u.id).post_count,
      social: { names: social.slice(0, 2), total: social.length },
      common: { names: names.slice(0, 2).map(n => ({ name: n.name, posters: n.posters })), more: Math.max(0, nameTotal - 2), records },
      latest: latest.all(u.id).map(p => ({ id: p.id, title: p.title, cover: p.thumb_image || p.cover_image || null })),
    })),
  };
}
// The log line for the admin view: why someone was introduced.
export function introReason(item) {
  const parts = [];
  if (item.social.total) parts.push(`follows: ${item.social.names.join(', ')}${item.social.total > item.social.names.length ? ` +${item.social.total - item.social.names.length}` : ''}`);
  if (item.common.names.length) parts.push(`both post: ${item.common.names.map(n => n.name).join(', ')}${item.common.more ? ` +${item.common.more}` : ''}`);
  if (item.common.records) parts.push(`${item.common.records} record${item.common.records === 1 ? '' : 's'} in common`);
  return parts.join(' · ');
}

// A profile (2026-10-05): the wall's card. Interests come from what the
// owner chose to post (their posts + records they ♥'d, as inCommon): top styles,
// artists, labels; plus their favourites and the playlists they show.
// Favourites (♥'d artists, labels, channels) lead their lists. Signed-in
// visitors also get who connects them; the owner gets every playlist and
// numbers only they see (not a scoreboard).
function tally(table, col, userId, limit) {
  return db.prepare(`
    WITH theirs AS (${THEIRS})
    SELECT MIN(n.${col}) AS name, COUNT(DISTINCT t.p) AS count
    FROM theirs t JOIN ${table} n ON n.post_id = t.p
    WHERE t.u = ? AND trim(n.${col}) <> '' AND lower(trim(n.${col})) NOT IN ('various', 'various artists')
    GROUP BY lower(n.${col}) ORDER BY count DESC, name LIMIT ?
  `).all(userId, limit);
}
// Discogs files a record under a broad genre AND specific styles (both land
// in post_genres). Styles say more about someone — Deep House, Jazz-Funk —
// so they lead; the broad genres only fill in when there are few styles.
const DISCOGS_GENRES = new Set(['electronic', 'rock', 'jazz', 'funk / soul', 'hip hop', 'pop', 'classical', 'reggae', 'latin', 'blues',
  'folk, world, & country', 'stage & screen', 'non-music', "children's", 'brass & military']);
function soundOf(userId) {
  const all = tally('post_genres', 'genre', userId, 60);
  const styles = all.filter(g => !DISCOGS_GENRES.has(g.name.toLowerCase()));
  return [...styles, ...all.filter(g => DISCOGS_GENRES.has(g.name.toLowerCase()))].slice(0, 6);
}
// Favourites (2026-10-06): artists, labels and channels a user ♥'d —
// three lists, oldest first (the order they were added).
export const FAVOURITE_KINDS = ['artist', 'label', 'channel'];
export function favouritesOf(userId) {
  const out = { artist: [], label: [], channel: [] };
  for (const r of db.prepare('SELECT kind, name FROM favourite_names WHERE user_id = ? ORDER BY created_at, name').all(userId)) out[r.kind]?.push(r.name);
  return out;
}
export function setFavourite(userId, kind, name, on) {
  const clean = String(name || '').trim().slice(0, 200);
  if (!FAVOURITE_KINDS.includes(kind) || !clean) return false;
  if (on) db.prepare('INSERT OR IGNORE INTO favourite_names (user_id, kind, name, name_key) VALUES (?, ?, ?, ?)').run(userId, kind, clean, clean.toLowerCase());
  else db.prepare('DELETE FROM favourite_names WHERE user_id = ? AND kind = ? AND name_key = ?').run(userId, kind, clean.toLowerCase());
  return true;
}
export const postedLabels = userId => tally('post_labels', 'label_name', userId, 500);
export function profileOf(ownerId, viewerId) {
  const u = db.prepare('SELECT id, username, bio, created_at FROM users WHERE id = ?').get(ownerId);
  const own = viewerId === ownerId;
  const favs = favouritesOf(ownerId);
  // A list led by the favourites (♥), filled up to `fill` from what they post.
  const ledBy = (favNames, posted, fill) => {
    const count = new Map(posted.map(x => [x.name.toLowerCase(), x.count]));
    const favSet = new Set(favNames.map(n => n.toLowerCase()));
    return [
      ...favNames.map(name => ({ name, count: count.get(name.toLowerCase()) || 0, favourite: true })),
      ...posted.filter(x => !favSet.has(x.name.toLowerCase())).slice(0, Math.max(0, fill - favNames.length)),
    ];
  };
  const playlistRow = p => ({ id: p.id, name: p.name, kind: p.kind, shown: !!p.on_profile, share_token: p.share_token, is_default: !!p.is_default,
    track_count: db.prepare('SELECT COUNT(*) c FROM playlist_tracks WHERE playlist_id = ?').get(p.id).c });
  const out = {
    username: u.username, bio: u.bio || '', member_since: u.created_at, is_owner: own,
    post_count: wallStats(ownerId).post_count,
    follower_count: db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id = ?').get(ownerId).c,
    sound: soundOf(ownerId),
    artists: ledBy(favs.artist, tally('post_artists', 'artist_name', ownerId, 12), 6),
    labels: ledBy(favs.label, postedLabels(ownerId), 6),
    channels: favs.channel.map(name => ({ name, favourite: true })),
    playlists: db.prepare('SELECT * FROM playlists WHERE owner_id = ? AND on_profile = 1 ORDER BY is_default DESC, created_at').all(ownerId).map(playlistRow),
    // Who they follow, newest first — a friends list to explore (2026-10-05).
    follows: (() => {
      const rows = db.prepare('SELECT u.username FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY f.created_at DESC, u.username').all(ownerId);
      return { names: rows.slice(0, 24).map(r => r.username), total: rows.length };
    })(),
  };
  if (own) {
    out.allPlaylists = db.prepare('SELECT * FROM playlists WHERE owner_id = ? ORDER BY is_default DESC, created_at').all(ownerId).map(playlistRow);
    out.private = {
      hearted: db.prepare('SELECT COUNT(DISTINCT j.user_id) c FROM post_joins j JOIN posts p ON p.id = j.post_id WHERE p.wall_user_id = ?').get(ownerId).c,
      replies: db.prepare('SELECT COUNT(*) c FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.user_id = ? AND c.user_id <> ?').get(ownerId, ownerId).c,
    };
  } else if (viewerId) {
    out.following = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(viewerId, ownerId);
    // People you follow who follow them.
    const via = db.prepare(`SELECT u.username FROM follows a JOIN follows b ON b.follower_id = a.followee_id JOIN users u ON u.id = a.followee_id
      WHERE a.follower_id = ? AND b.followee_id = ? AND a.followee_id <> ? ORDER BY u.username`).all(viewerId, ownerId, ownerId).map(r => r.username);
    out.followedBy = { names: via.slice(0, 2), total: via.length };
  }
  return out;
}

// How many posts are on a wall (made or joined) and when the latest went up.
export function wallStats(userId) {
  return db.prepare(`WITH e AS (${ENTRIES}) SELECT COUNT(DISTINCT post_id) AS post_count, MAX(at) AS latest FROM e WHERE owner = ?`).get(userId);
}

// 24 url-safe characters — the share link is the only key to a feed.
export const newShareToken = () => crypto.randomBytes(18).toString('base64url');
