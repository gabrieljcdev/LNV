import express from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users/:username
router.get('/:username', (req, res, next) => {
  try {
    // Public profile only — never the email or password hash.
    const user = db.prepare('SELECT id, username, display_name, bio, avatar_url, created_at FROM users WHERE username = ?').get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(user.id).count;

    res.json({ ...user, postCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/users — the old "pick a name, no password" sign-up. Accounts are
// made through /api/auth/register now (password + confirmed email).
router.post('/', (req, res) => res.status(410).json({ error: 'Create an account at /login.' }));

// Note: /:username/walls and /:username/manifest (the old Profile-page data
// endpoints) were removed in the crates/walls rescope — both queried tables
// that no longer exist, and Profile itself was deleted with nothing left to
// call them.

// PATCH /api/users/:username/bio — Simple bio updater
router.patch('/:username/bio', requireAuth, (req, res, next) => {
  try {
    if (req.params.username !== req.user.username) return res.status(403).json({ error: 'You can only edit your own bio.' });
    const { bio } = req.body;
    db.prepare('UPDATE users SET bio = ? WHERE username = ?').run(bio, req.params.username);
    res.json({ message: 'Identity updated' });
  } catch (err) {
    next(err);
  }
});

export default router;