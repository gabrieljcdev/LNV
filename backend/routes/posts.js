import express from 'express';
import db from '../db/database.js';
import { enrichPostTracks } from '../services/youtubeService.js';

const router = express.Router();

function getFullPost(postId) {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return null;
  const artists = db.prepare('SELECT * FROM post_artists WHERE post_id = ?').all(postId);
  const labels = db.prepare('SELECT * FROM post_labels WHERE post_id = ?').all(postId);
  const genres = db.prepare('SELECT genre FROM post_genres WHERE post_id = ?').all(postId).map(g => g.genre);
  const tracks = db.prepare('SELECT * FROM post_tracks WHERE post_id = ?').all(postId);
  const user = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(post.user_id);
  const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ?').get(postId).count;
  return { ...post, artists, labels, genres, tracks, user, commentCount };
}

router.get('/', (req, res, next) => {
  try {
    const { artist, label, genre, year, catno, user_id, discogs_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let postIds;
    if (discogs_id) { postIds = db.prepare('SELECT id FROM posts WHERE discogs_id = ?').all(Number(discogs_id)).map(r => r.id); }
    else if (artist) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_artists WHERE LOWER(artist_name) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+artist+'%', Number(limit), offset).map(r => r.post_id); }
    else if (label) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_labels WHERE LOWER(label_name) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+label+'%', Number(limit), offset).map(r => r.post_id); }
    else if (genre) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_genres WHERE LOWER(genre) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+genre+'%', Number(limit), offset).map(r => r.post_id); }
    else if (catno) { postIds = db.prepare('SELECT DISTINCT post_id FROM post_labels WHERE LOWER(catalogue_number) LIKE LOWER(?) ORDER BY post_id DESC LIMIT ? OFFSET ?').all('%'+catno+'%', Number(limit), offset).map(r => r.post_id); }
    else if (year) { postIds = db.prepare('SELECT id FROM posts WHERE year = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(Number(year), Number(limit), offset).map(r => r.id); }
    else if (user_id) { postIds = db.prepare('SELECT id FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(Number(user_id), Number(limit), offset).map(r => r.id); }
    else { postIds = db.prepare('SELECT id FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?').all(Number(limit), offset).map(r => r.id); }
    const posts = postIds.map(id => getFullPost(id)).filter(Boolean);
    const total = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
    res.json({ posts, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const post = getFullPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    const {
      user_id = 1, discogs_id, discogs_type = 'release',
      title, year, country, cover_image, thumb_image, notes, discogs_url,
      stream_url, embed_url, platform, post_type = 'album',
      artists = [], labels = [], genres = [], tracks = [],
    } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const resolvedDiscogsId = discogs_id || (discogs_url ? discogs_url.match(/release\/(\d+)/)?.[1] : null);
    const result = db.prepare(`
      INSERT OR IGNORE INTO posts (user_id, discogs_id, discogs_type, title, year, country, cover_image, thumb_image, notes, discogs_url, stream_url, embed_url, platform, post_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user_id, resolvedDiscogsId ? Number(resolvedDiscogsId) : null,
      discogs_type, title, year || null, country || null,
      cover_image || null, thumb_image || null, notes || null, discogs_url || null,
      stream_url || null, embed_url || null, platform || null, post_type || 'album'
    );
    if (!result.lastInsertRowid) return res.status(409).json({ error: 'A post with this Discogs release already exists' });
    const postId = result.lastInsertRowid;
    const ia = db.prepare('INSERT INTO post_artists (post_id, artist_name, discogs_artist_id) VALUES (?, ?, ?)');
    for (const a of artists) ia.run(postId, a.name, a.id || null);
    const il = db.prepare('INSERT INTO post_labels (post_id, label_name, catalogue_number, discogs_label_id) VALUES (?, ?, ?, ?)');
    for (const l of labels) il.run(postId, l.name, l.catno || null, l.id || null);
    const ig = db.prepare('INSERT INTO post_genres (post_id, genre) VALUES (?, ?)');
    for (const g of genres) ig.run(postId, g);
    const it = db.prepare('INSERT INTO post_tracks (post_id, position, title, duration, youtube_url, stream_url) VALUES (?, ?, ?, ?, ?, ?)');
    for (const t of tracks) it.run(postId, t.position || null, t.title, t.duration || null, t.youtube_url || t.stream_url || null, t.stream_url || t.youtube_url || null);
    res.status(201).json(getFullPost(postId));
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const allowed = ['cover_image', 'thumb_image', 'notes', 'title', 'year', 'stream_url', 'embed_url', 'platform', 'post_type'];
    const updates = []; const values = [];
    for (const field of allowed) { if (req.body[field] !== undefined) { updates.push(field + ' = ?'); values.push(req.body[field]); } }
    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(id);
    db.prepare('UPDATE posts SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
    res.json(getFullPost(id));
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    res.json({ message: 'Post deleted' });
  } catch (err) { next(err); }
});

router.get('/:id/comments', (req, res, next) => {
  try {
    const comments = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar_url FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC').all(Number(req.params.id));
    res.json(comments);
  } catch (err) { next(err); }
});

router.post('/:id/comments', (req, res, next) => {
  try {
    const { user_id = 1, content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const result = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(Number(req.params.id), user_id, content);
    const comment = db.prepare('SELECT c.*, u.username, u.display_name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(result.lastInsertRowid);
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

router.post('/:id/enrich-youtube', async (req, res, next) => {
  try { const tracks = await enrichPostTracks(Number(req.params.id)); res.json({ tracks }); }
  catch (err) { next(err); }
});

router.post('/backfill-streams', (req, res) => {
  const { posts: updates } = req.body;
  if (!updates?.length) return res.status(400).json({ error: 'No updates' });
  try {
    const stmt = db.prepare('UPDATE posts SET stream_url = ?, embed_url = ?, platform = ?, post_type = ? WHERE id = ?');
    for (const u of updates) stmt.run(u.stream_url || null, u.embed_url || null, u.platform || null, u.post_type || 'album', u.id);
    res.json({ ok: true, updated: updates.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default router;