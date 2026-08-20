import express from 'express';
import db from '../db/database.js';

const router = express.Router();

router.get('/netlink/stats', (req, res) => {
  try {
    const records    = db.prepare(`SELECT COUNT(*) as count FROM posts`).get();
    const members    = db.prepare(`SELECT COUNT(*) as count FROM users`).get();
    const lastPost   = db.prepare(`SELECT created_at FROM netlink_posts ORDER BY created_at DESC LIMIT 1`).get();
 
    res.json({
      records:  records.count  || 0,
      members:  members.count  || 0,
      lastPost: lastPost?.created_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all netlink posts — includes linked post data if post_id exists
router.get('/netlink/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT np.*, u.username
    FROM netlink_posts np
    LEFT JOIN users u ON np.user_id = u.id
    ORDER BY np.created_at DESC
    LIMIT 50
  `).all();

  const enriched = posts.map(np => {
    if (!np.post_id) return np;
    const post    = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(np.post_id);
    if (!post) return np;
    const artists = db.prepare(`SELECT * FROM post_artists WHERE post_id = ?`).all(np.post_id);
    const labels  = db.prepare(`SELECT * FROM post_labels WHERE post_id = ?`).all(np.post_id);
    const genres  = db.prepare(`SELECT genre FROM post_genres WHERE post_id = ?`).all(np.post_id).map(g => g.genre);
    const tracks  = db.prepare(`SELECT * FROM post_tracks WHERE post_id = ?`).all(np.post_id);
    return { ...np, linkedPost: { ...post, artists, labels, genres, tracks } };
  });

  res.json(enriched);
});

// Create a netlink post
router.post('/netlink/posts', (req, res) => {
  const { subject, body, user_id, post_id } = req.body;
  if (!subject) return res.status(400).json({ error: 'subject required' });

  const result = db.prepare(`
    INSERT INTO netlink_posts (subject, body, user_id, post_id)
    VALUES (?, ?, ?, ?)
  `).run(subject || 'NO SUBJECT', body || null, user_id || 1, post_id || null);

  const post = db.prepare('SELECT * FROM netlink_posts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(post);
});

// Get comments for a netlink post
router.get('/netlink/posts/:id/comments', (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT nc.*, u.username
      FROM netlink_comments nc
      LEFT JOIN users u ON nc.user_id = u.id
      WHERE nc.netlink_post_id = ?
      ORDER BY nc.created_at ASC
    `).all(Number(req.params.id));
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post a comment on a netlink post
router.post('/netlink/posts/:id/comments', (req, res) => {
  const { body, username } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'body required' });

  try {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const result = db.prepare(`
      INSERT INTO netlink_comments (netlink_post_id, user_id, body)
      VALUES (?, ?, ?)
    `).run(Number(req.params.id), user.id, body.trim());

    const comment = db.prepare(`
      SELECT nc.*, u.username
      FROM netlink_comments nc
      LEFT JOIN users u ON nc.user_id = u.id
      WHERE nc.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.*, COUNT(p.id) as post_count
    FROM users u
    LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// Delete netlink post by linked post_id — specific route before /:id
router.delete('/netlink/posts/by-post/:postId', (req, res) => {
  try {
    db.prepare('DELETE FROM netlink_posts WHERE post_id = ?').run(Number(req.params.postId));
    res.json({ message: 'Netlink post deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete netlink post by id
router.delete('/netlink/posts/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM netlink_posts WHERE id = ?').run(Number(req.params.id));
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
