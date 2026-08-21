import express from 'express';
import db from '../db/database.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const genres = db.prepare(`
      SELECT DISTINCT genre, COUNT(*) as record_count
      FROM post_genres
      GROUP BY genre
      ORDER BY genre ASC
    `).all();
    res.json(genres);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT p.* FROM posts p
      JOIN post_genres pg ON pg.post_id = p.id
      WHERE pg.genre = ?
      ORDER BY p.created_at DESC
    `).all(req.params.name);
    res.json({ genre: req.params.name, posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;