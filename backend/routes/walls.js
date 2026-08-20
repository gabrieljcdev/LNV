import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// GET /api/walls — list all public walls
router.get('/', (req, res, next) => {
  try {
    const walls = db.prepare(`
      SELECT w.*, u.username, u.display_name,
        (SELECT COUNT(*) FROM wall_posts wp WHERE wp.wall_id = w.id) AS post_count
      FROM walls w
      JOIN users u ON w.owner_id = u.id
      WHERE w.is_public = 1
      ORDER BY w.created_at DESC
    `).all();
    res.json(walls);
  } catch (err) {
    next(err);
  }
});

// GET /api/walls/:id
router.get('/:id', (req, res, next) => {
  try {
    const wall = db.prepare(`
      SELECT w.*, u.username, u.display_name
      FROM walls w
      JOIN users u ON w.owner_id = u.id
      WHERE w.id = ?
    `).get(Number(req.params.id));
    if (!wall) return res.status(404).json({ error: 'Wall not found' });

    const posts = db.prepare(`
      SELECT p.* FROM posts p
      JOIN wall_posts wp ON p.id = wp.post_id
      WHERE wp.wall_id = ?
      ORDER BY wp.added_at DESC
    `).all(Number(req.params.id));

    res.json({ ...wall, posts });
  } catch (err) {
    next(err);
  }
});

// POST /api/walls — create a wall
router.post('/', (req, res, next) => {
  try {
    const { owner_id = 1, title, description, is_public = 1 } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const result = db.prepare(
      'INSERT INTO walls (owner_id, title, description, is_public) VALUES (?, ?, ?, ?)'
    ).run(owner_id, title, description, is_public ? 1 : 0);
    const wall = db.prepare('SELECT * FROM walls WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(wall);
  } catch (err) {
    next(err);
  }
});

// POST /api/walls/:id/posts — save a post to a wall
router.post('/:id/posts', (req, res, next) => {
  try {
    const { post_id } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id is required' });
    db.prepare('INSERT OR IGNORE INTO wall_posts (wall_id, post_id) VALUES (?, ?)').run(
      Number(req.params.id), Number(post_id)
    );
    res.status(201).json({ message: 'Post added to wall' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/walls/:wallId/posts/:postId
router.delete('/:wallId/posts/:postId', (req, res, next) => {
  try {
    db.prepare('DELETE FROM wall_posts WHERE wall_id = ? AND post_id = ?').run(
      Number(req.params.wallId), Number(req.params.postId)
    );
    res.json({ message: 'Post removed from wall' });
  } catch (err) {
    next(err);
  }
});

export default router;