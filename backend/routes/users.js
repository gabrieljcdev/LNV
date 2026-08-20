import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// GET /api/users/:username
router.get('/:username', (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(user.id).count;
    const wallCount = db.prepare('SELECT COUNT(*) as count FROM walls WHERE owner_id = ?').get(user.id).count;

    res.json({ ...user, postCount, wallCount });
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

// GET /api/users/:username/walls
router.get('/:username/walls', (req, res, next) => {
  try {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const walls = db.prepare('SELECT * FROM walls WHERE owner_id = ? ORDER BY created_at DESC').all(user.id);
    res.json(walls);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:username/manifest — The "Heavy Lifter" for the Profile page
router.get('/:username/manifest', (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 1. Stats
    const stats = {
      uploads: db.prepare('SELECT COUNT(*) as c FROM posts WHERE user_id = ?').get(user.id).c,
      crates: db.prepare('SELECT COUNT(*) as c FROM crates WHERE user_id = ?').get(user.id).c,
    };

    // 2. Frequencies (Top 5 Favorites based on uploads)
    const favorites = {
      artists: db.prepare(`
        SELECT artist_name, COUNT(*) as count 
        FROM post_artists 
        WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?) 
        GROUP BY artist_name ORDER BY count DESC LIMIT 5
      `).all(user.id),
      
      labels: db.prepare(`
        SELECT label_name, COUNT(*) as count 
        FROM post_labels 
        WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?) 
        GROUP BY label_name ORDER BY count DESC LIMIT 5
      `).all(user.id),
      
      genres: db.prepare(`
        SELECT genre, COUNT(*) as count 
        FROM post_genres 
        WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?) 
        GROUP BY genre ORDER BY count DESC LIMIT 5
      `).all(user.id).map(g => g.genre)
    };

    // 3. Crates
    const crates = {
      created: db.prepare('SELECT * FROM crates WHERE user_id = ? ORDER BY created_at DESC').all(user.id),
      followed: db.prepare(`
        SELECT c.* FROM crates c 
        JOIN crate_follows f ON f.crate_id = c.id 
        WHERE f.user_id = ?
        ORDER BY f.followed_at DESC
      `).all(user.id)
    };

    res.json({ user, stats, favorites, crates });
  } catch (err) {
    next(err);
  }
});

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