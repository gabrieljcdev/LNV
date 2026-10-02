import express from 'express';
import db from '../db/database.js';
import { enrichPostTracks } from '../services/youtubeService.js';
import { matchMissingDiscogs } from '../services/discogsMatcher.js';
import { searchPostIds, suggest, parsePostNumber } from '../services/searchService.js';
import { requireAuth, requireAdmin, canModify } from '../middleware/auth.js';
import { logEvent } from '../services/logService.js';

const router = express.Router();

const SPOTLIGHT_EVERY = 10;

// Query fragments keyed by subject type — used both when checking whether a
// subject just crossed a spotlight threshold and when pulling representative
// posts for a spotlight's cover collage.
const SUBJECT_JOIN = {
  artist: `JOIN post_artists x ON x.post_id = p.id AND x.artist_name = ?`,
  label:  `JOIN post_labels  x ON x.post_id = p.id AND x.label_name  = ?`,
  genre:  `JOIN post_genres  x ON x.post_id = p.id AND x.genre       = ?`,
};

function getFullPost(postId) {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return null;
  const artists = db.prepare('SELECT * FROM post_artists WHERE post_id = ?').all(postId);
  const labels = db.prepare('SELECT * FROM post_labels WHERE post_id = ?').all(postId);
  const genres = db.prepare('SELECT genre FROM post_genres WHERE post_id = ?').all(postId).map(g => g.genre);
  const tracks = db.prepare('SELECT * FROM post_tracks WHERE post_id = ?').all(postId);
  const user = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(post.user_id);
  const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ?').get(postId).count;
  const full = { ...post, artists, labels, genres, tracks, user, commentCount };
  if (post.is_spotlight) {
    const sl = db.prepare('SELECT subject_type, subject_name, post_count_at_trigger FROM spotlights WHERE post_id = ?').get(postId);
    if (sl) {
      full.spotlightType = sl.subject_type;
      full.spotlightCount = sl.post_count_at_trigger;
      full.spotlightCovers = db.prepare(`
        SELECT p.id, p.title, p.cover_image, p.thumb_image, p.created_at
        FROM posts p ${SUBJECT_JOIN[sl.subject_type]}
        WHERE p.is_spotlight = 0
        ORDER BY p.created_at DESC LIMIT 4
      `).all(sl.subject_name);
    }
  }
  return full;
}

// After a post is tagged with artists/labels/genres, check whether any of
// those subjects just crossed a multiple-of-SPOTLIGHT_EVERY post count.
// First time crossing it, post a synthetic editorial "spotlight" card and
// record it in `spotlights` so the same milestone never fires twice.
function triggerSpotlights(postId) {
  const subjects = [
    ...db.prepare('SELECT DISTINCT artist_name AS name FROM post_artists WHERE post_id = ?').all(postId).map(r => ({ type: 'artist', name: r.name })),
    ...db.prepare('SELECT DISTINCT label_name AS name FROM post_labels WHERE post_id = ?').all(postId).map(r => ({ type: 'label', name: r.name })),
    ...db.prepare('SELECT DISTINCT genre AS name FROM post_genres WHERE post_id = ?').all(postId).map(r => ({ type: 'genre', name: r.name })),
  ];

  for (const { type, name } of subjects) {
    if (!name) continue;
    const join = SUBJECT_JOIN[type];
    const { c: count } = db.prepare(`
      SELECT COUNT(DISTINCT p.id) as c FROM posts p ${join} WHERE p.is_spotlight = 0
    `).get(name);
    if (count <= 0 || count % SPOTLIGHT_EVERY !== 0) continue;

    const already = db.prepare(
      'SELECT 1 FROM spotlights WHERE subject_type = ? AND subject_name = ? AND post_count_at_trigger = ?'
    ).get(type, name, count);
    if (already) continue;

    const rep = db.prepare(`
      SELECT p.cover_image, p.thumb_image FROM posts p ${join}
      WHERE p.is_spotlight = 0 ORDER BY p.created_at DESC LIMIT 1
    `).get(name);

    const insertPost = db.prepare(`
      INSERT INTO posts (user_id, discogs_type, title, cover_image, thumb_image, notes, is_spotlight, spotlight_subject, post_type)
      VALUES (1, 'spotlight', ?, ?, ?, ?, 1, ?, 'spotlight')
    `);
    const result = insertPost.run(
      `${name} — ${count} posts`,
      rep?.cover_image || null, rep?.thumb_image || null,
      `${count} posts tagged ${name} in the feed.`,
      name
    );
    db.prepare(
      'INSERT INTO spotlights (subject_type, subject_name, post_count_at_trigger, post_id) VALUES (?, ?, ?, ?)'
    ).run(type, name, count, result.lastInsertRowid);
  }
}

router.get('/', (req, res, next) => {
  try {
    const { artist, label, genre, year, catno, user_id, discogs_id, search, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let postIds;
    if (discogs_id) { postIds = db.prepare('SELECT id FROM posts WHERE discogs_id = ?').all(Number(discogs_id)).map(r => r.id); }
    else if (search) {
      // Ranked full-text search (services/searchService.js) — the one search
      // implementation for the feed and the search box's dropdown. A post
      // number ("54", "#54") puts that post first.
      postIds = searchPostIds(search, { limit, offset });
      const num = parsePostNumber(search);
      if (num != null && Number(page) === 1 && db.prepare('SELECT 1 FROM posts WHERE id = ? AND is_spotlight = 0').get(num)) {
        postIds = [num, ...postIds.filter(id => id !== num)];
      }
    }
    else if (artist) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_artists WHERE LOWER(artist_name) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+artist+'%', Number(limit), offset).map(r => r.post_id); }
    else if (label) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_labels WHERE LOWER(label_name) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+label+'%', Number(limit), offset).map(r => r.post_id); }
    else if (genre) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_genres WHERE LOWER(genre) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+genre+'%', Number(limit), offset).map(r => r.post_id); }
    else if (catno) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_labels WHERE LOWER(catalogue_number) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+catno+'%', Number(limit), offset).map(r => r.post_id); }
    else if (year) { postIds = db.prepare('SELECT id FROM posts WHERE year = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(Number(year), Number(limit), offset).map(r => r.id); }
    else if (user_id) { postIds = db.prepare('SELECT id FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(Number(user_id), Number(limit), offset).map(r => r.id); }
    else {
      // The feed (2026-10-01): newest first, paged by cursor — `before` is
      // the last post id the feed already has — so posts added while
      // someone's scrolling can't shift the pages (no duplicates or gaps).
      const before = Number(req.query.before) || null;
      postIds = before
        ? db.prepare('SELECT id FROM posts WHERE is_spotlight = 0 AND id < ? ORDER BY id DESC LIMIT ?').all(before, Number(limit)).map(r => r.id)
        : db.prepare('SELECT id FROM posts WHERE is_spotlight = 0 ORDER BY id DESC LIMIT ? OFFSET ?').all(Number(limit), offset).map(r => r.id);
    }
    const posts = postIds.map(id => getFullPost(id)).filter(Boolean);
    const total = db.prepare('SELECT COUNT(*) as count FROM posts WHERE is_spotlight = 0').get().count;
    // A full page means there may be more; the feed asks for the next one.
    res.json({ posts, total, page: Number(page), limit: Number(limit), hasMore: postIds.length === Number(limit) });
  } catch (err) { next(err); }
});

// The search box's dropdown: a post-number jump, ranked posts, and
// matching artists / labels / genres. Must sit above GET /:id.
// Every post as a compact summary, for the browse drawers (artists, labels,
// genres, live sets) — they group and filter on the client. Newest first.
router.get('/browse', (req, res, next) => {
  try {
    const posts = db.prepare(`SELECT id, title, post_title, year, cover_image, thumb_image, post_type, channel, platform, stream_url, created_at, discogs_id
      FROM posts WHERE is_spotlight = 0 ORDER BY id DESC`).all();
    const by = (sql) => { const m = new Map(); for (const r of db.prepare(sql).all()) { if (!m.has(r.post_id)) m.set(r.post_id, []); m.get(r.post_id).push(r); } return m; };
    const artists = by('SELECT post_id, artist_name, discogs_artist_id FROM post_artists ORDER BY id');
    const labels = by('SELECT post_id, label_name, catalogue_number, discogs_label_id FROM post_labels ORDER BY id');
    const genres = by('SELECT post_id, genre FROM post_genres ORDER BY id');
    const tracks = new Map(db.prepare('SELECT post_id, COUNT(*) c FROM post_tracks GROUP BY post_id').all().map(r => [r.post_id, r.c]));
    res.json(posts.map(p => ({
      id: p.id, title: p.title, post_title: p.post_title, year: p.year,
      cover: p.thumb_image || p.cover_image || null, post_type: p.post_type,
      channel: p.channel, platform: p.platform, stream_url: p.stream_url, created_at: p.created_at,
      discogs_id: p.discogs_id || null,
      artists: (artists.get(p.id) || []).map(r => r.artist_name),
      // name -> Discogs id, for the drawers' full discography (2026-10-02)
      artist_ids: Object.fromEntries((artists.get(p.id) || []).filter(r => r.discogs_artist_id).map(r => [r.artist_name, r.discogs_artist_id])),
      labels: (labels.get(p.id) || []).map(r => ({ name: r.label_name, catno: r.catalogue_number, id: r.discogs_label_id || null })),
      genres: (genres.get(p.id) || []).map(r => r.genre),
      track_count: tracks.get(p.id) || 0,
    })));
  } catch (err) { next(err); }
});

router.get('/suggest', (req, res, next) => {
  try { res.json(suggest(req.query.q)); } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const post = getFullPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) { next(err); }
});

// Signed in only (2026-10-01); the post belongs to whoever is signed in —
// a user_id in the body is ignored.
router.post('/', requireAuth, (req, res, next) => {
  try {
    const user_id = req.user.id;
    const {
      discogs_id, discogs_type = 'release',
      title, year, country, cover_image, thumb_image, notes, discogs_url,
      stream_url, embed_url, platform, post_type = 'album', channel, post_title,
      artists = [], labels = [], genres = [], tracks = [],
    } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const resolvedDiscogsId = discogs_id || (discogs_url ? discogs_url.match(/release\/(\d+)/)?.[1] : null);
    const result = db.prepare(`
      INSERT OR IGNORE INTO posts (user_id, discogs_id, discogs_type, title, year, country, cover_image, thumb_image, notes, discogs_url, stream_url, embed_url, platform, post_type, channel, post_title)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user_id, resolvedDiscogsId ? Number(resolvedDiscogsId) : null,
      discogs_type, title, year || null, country || null,
      cover_image || null, thumb_image || null, notes || null, discogs_url || null,
      stream_url || null, embed_url || null, platform || null, post_type || 'album',
      channel || null, (post_title || '').trim() || null
    );
    if (!result.lastInsertRowid) return res.status(409).json({ error: 'A post with this Discogs release already exists' });
    const postId = result.lastInsertRowid;
    const ia = db.prepare('INSERT INTO post_artists (post_id, artist_name, discogs_artist_id) VALUES (?, ?, ?)');
    for (const a of artists) ia.run(postId, a.name, a.id || null);
    const il = db.prepare('INSERT INTO post_labels (post_id, label_name, catalogue_number, discogs_label_id) VALUES (?, ?, ?, ?)');
    for (const l of labels) il.run(postId, l.name, l.catno || null, l.id || null);
    const ig = db.prepare('INSERT INTO post_genres (post_id, genre) VALUES (?, ?)');
    for (const g of genres) ig.run(postId, g);
    const it = db.prepare('INSERT INTO post_tracks (post_id, position, title, duration, youtube_url, stream_url, embed_url) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const t of tracks) it.run(postId, t.position || null, t.title, t.duration || null, t.youtube_url || t.stream_url || null, t.stream_url || t.youtube_url || null, t.embed_url || null);
    // triggerSpotlights(postId); — disabled 2026-08-24: spotlights are now
    // computed client-side per feed load (Feed.jsx buildSpotlightPool),
    // every SPOTLIGHT_EVERYth post, randomized and not repeated within a
    // load. Nothing is persisted for them any more, so this no longer needs
    // to run on insert. Left in place (unused) rather than deleted in case
    // we want DB-persisted milestone spotlights back later.
    logEvent('info', 'post', `New post #${postId}: ${title}`, { req, detail: { platform: platform || null, post_type } });
    res.status(201).json(getFullPost(postId));
    // No release matched at compose time: look again in the background so
    // the post gets its Discogs / BUY links if Discogs has it.
    if (!resolvedDiscogsId && post_type !== 'livemix') {
      matchMissingDiscogs().catch(e => console.warn('[discogs-match]', e.message));
    }
  } catch (err) { next(err); }
});

// Edit/delete are limited to the post's author (or lnv_admin). Usernames are
// password-less (see Login.jsx), so this stops accidents and casual
// tampering from the UI, not a determined caller — same trust model as
// posting itself.

router.patch('/:id', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!canModify(post, req.user)) return res.status(403).json({ error: 'Only the person who posted this can edit it' });
    const allowed = ['cover_image', 'thumb_image', 'notes', 'title', 'year', 'stream_url', 'embed_url', 'platform', 'post_type', 'channel', 'discogs_id', 'discogs_url', 'post_title'];
    const updates = []; const values = [];
    for (const field of allowed) { if (req.body[field] !== undefined) { updates.push(field + ' = ?'); values.push(req.body[field] === '' ? null : req.body[field]); } }
    const { artists, labels, genres, tracks } = req.body;
    const hasLists = [artists, labels, genres, tracks].some(Array.isArray);
    if (updates.length === 0 && !hasLists) return res.status(400).json({ error: 'No valid fields to update' });

    // Lists are replaced wholesale when sent (the compose form always sends
    // the full current list); omitted lists are left as they were.
    db.transaction(() => {
      if (updates.length) db.prepare('UPDATE posts SET ' + updates.join(', ') + ' WHERE id = ?').run(...values, id);
      if (Array.isArray(artists)) {
        db.prepare('DELETE FROM post_artists WHERE post_id = ?').run(id);
        const ia = db.prepare('INSERT INTO post_artists (post_id, artist_name, discogs_artist_id) VALUES (?, ?, ?)');
        for (const a of artists) if (a?.name) ia.run(id, a.name, a.id || null);
      }
      if (Array.isArray(labels)) {
        db.prepare('DELETE FROM post_labels WHERE post_id = ?').run(id);
        const il = db.prepare('INSERT INTO post_labels (post_id, label_name, catalogue_number, discogs_label_id) VALUES (?, ?, ?, ?)');
        for (const l of labels) if (l?.name) il.run(id, l.name, l.catno || null, l.id || null);
      }
      if (Array.isArray(genres)) {
        db.prepare('DELETE FROM post_genres WHERE post_id = ?').run(id);
        const ig = db.prepare('INSERT INTO post_genres (post_id, genre) VALUES (?, ?)');
        for (const g of genres) if (g) ig.run(id, g);
      }
      if (Array.isArray(tracks)) {
        db.prepare('DELETE FROM post_tracks WHERE post_id = ?').run(id);
        const it = db.prepare('INSERT INTO post_tracks (post_id, position, title, duration, youtube_url, stream_url, embed_url) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const t of tracks) if (t?.title) it.run(id, t.position || null, t.title, t.duration || null, t.youtube_url || t.stream_url || null, t.stream_url || t.youtube_url || null, t.embed_url || null);
      }
    })();
    logEvent('info', 'post', `Edited post #${id}: ${post.title}`, { req, detail: { by_author: post.user_id === req.user.id } });
    res.json(getFullPost(id));
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!canModify(post, req.user)) return res.status(403).json({ error: 'Only the person who posted this can delete it' });
    // foreign_keys isn't enabled on this connection, so the schema's ON
    // DELETE CASCADEs never fire — remove the child rows explicitly or they
    // stay behind as orphans.
    db.transaction(() => {
      for (const table of ['post_artists', 'post_labels', 'post_genres', 'post_tracks', 'comments', 'spotlights']) {
        db.prepare(`DELETE FROM ${table} WHERE post_id = ?`).run(id);
      }
      db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    })();
    logEvent('warn', 'post', `Deleted post #${id}: ${post.title}`, { req, detail: { by_author: post.user_id === req.user.id } });
    res.json({ message: 'Post deleted' });
  } catch (err) { next(err); }
});

router.get('/:id/comments', (req, res, next) => {
  try {
    const comments = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar_url FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC').all(Number(req.params.id));
    res.json(comments);
  } catch (err) { next(err); }
});

router.post('/:id/comments', requireAuth, (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const result = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(Number(req.params.id), user_id, content);
    const comment = db.prepare('SELECT c.*, u.username, u.display_name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(result.lastInsertRowid);
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

router.post('/:id/enrich-youtube', requireAuth, async (req, res, next) => {
  try { const tracks = await enrichPostTracks(Number(req.params.id)); res.json({ tracks }); }
  catch (err) { next(err); }
});

router.post('/backfill-streams', requireAuth, requireAdmin, (req, res) => {
  const { posts: updates } = req.body;
  if (!updates?.length) return res.status(400).json({ error: 'No updates' });
  try {
    const stmt = db.prepare('UPDATE posts SET stream_url = ?, embed_url = ?, platform = ?, post_type = ? WHERE id = ?');
    for (const u of updates) stmt.run(u.stream_url || null, u.embed_url || null, u.platform || null, u.post_type || 'album', u.id);
    res.json({ ok: true, updated: updates.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;