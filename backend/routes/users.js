import express from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Where a listener can play full tracks (2026-10-08): the services they subscribe to or are
// signed in to, so the feed can offer them first, plus what the players have shown
// (e.g. Spotify played full tracks, or only 30-second previews). A small JSON blob
// per user; the browser keeps its own copy for visitors who aren't signed in.
try { db.exec('ALTER TABLE users ADD COLUMN listening TEXT'); } catch { /* already there */ }
const LISTEN_SERVICES = ['spotify', 'apple', 'deezer', 'youtube', 'soundcloud', 'bandcamp'];
function cleanListening(b) {
  const have = [...new Set((Array.isArray(b?.have) ? b.have : []).filter(x => LISTEN_SERVICES.includes(x)))];
  const signals = {};
  for (const [k, v] of Object.entries(b?.signals && typeof b.signals === 'object' ? b.signals : {})) {
    if (LISTEN_SERVICES.includes(k) && ['full', 'preview'].includes(v?.last)) {
      signals[k] = { last: v.last, full: Math.min(Number(v.full) || 0, 9999), preview: Math.min(Number(v.preview) || 0, 9999) };
    }
  }
  return { have, signals };
}
router.get('/me/listening', requireAuth, (req, res, next) => {
  try {
    const row = db.prepare('SELECT listening FROM users WHERE id = ?').get(req.user.id);
    let parsed = null;
    try { parsed = row?.listening ? JSON.parse(row.listening) : null; } catch { parsed = null; }
    res.json({ listening: parsed ? cleanListening(parsed) : null });
  } catch (err) { next(err); }
});
router.put('/me/listening', requireAuth, (req, res, next) => {
  try {
    const clean = cleanListening(req.body);
    db.prepare('UPDATE users SET listening = ? WHERE id = ?').run(JSON.stringify(clean), req.user.id);
    res.json({ listening: clean });
  } catch (err) { next(err); }
});

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