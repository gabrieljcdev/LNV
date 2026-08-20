import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// GET /api/users/:username
router.get('/:username', (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(user.id).count;

    res.json({ ...user, postCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/users — register a user
router.post('/', (req, res, next) => {
  try {
    const { username, display_name, bio } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });
    const result = db.prepare(
      'INSERT INTO users (username, display_name, bio) VALUES (?, ?, ?)'
    ).run(username, display_name || username, bio || null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    next(err);
  }
});

// Note: /:username/walls and /:username/manifest (the old Profile-page data
// endpoints) were removed in the crates/walls rescope — both queried tables
// that no longer exist, and Profile itself was deleted with nothing left to
// call them.

// PATCH /api/users/:username/bio — Simple bio updater
router.patch('/:username/bio', (req, res, next) => {
  try {
    const { bio } = req.body;
    db.prepare('UPDATE users SET bio = ? WHERE username = ?').run(bio, req.params.username);
    res.json({ message: 'Identity updated' });
  } catch (err) {
    next(err);
  }
});

export default router;