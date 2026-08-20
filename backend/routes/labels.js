import express from 'express';
import db from '../db/database.js';
 
const router = express.Router();
 
// GET /api/labels — all labels with record count
router.get('/', (req, res) => {
  try {
    const labels = db.prepare(`
      SELECT
        label_name,
        COUNT(*) as record_count
      FROM post_labels
      GROUP BY label_name
      ORDER BY label_name ASC
    `).all();
    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// GET /api/labels/:name — single label with all its posts
router.get('/:name', (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT
        p.id,
        p.title,
        p.year,
        p.cover_image,
        p.thumb_image,
        p.created_at,
        pl.catalogue_number
      FROM posts p
      JOIN post_labels pl ON pl.post_id = p.id
      WHERE pl.label_name = ?
      ORDER BY p.year DESC, p.created_at DESC
    `).all(req.params.name);
    res.json({ label_name: req.params.name, posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
export default router;