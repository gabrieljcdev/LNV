import express from 'express';
import db from '../db/database.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const artists = db.prepare(`
      SELECT DISTINCT artist_name, COUNT(*) as record_count
      FROM post_artists
      GROUP BY artist_name
      ORDER BY artist_name ASC
    `).all();
    res.json(artists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT p.* FROM posts p
      JOIN post_artists pa ON pa.post_id = p.id
      WHERE pa.artist_name = ?
      ORDER BY p.created_at DESC
    `).all(req.params.name);
    res.json({ artist_name: req.params.name, posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;