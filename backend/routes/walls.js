import express from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { userByName, wallStats, inCommon, profileOf, setProfilePins, newShareToken } from '../services/collectionsService.js';

// Walls (2026-10-03): every user's public profile feed — the posts they
// made, readable by anyone (posts: GET /posts?wall=<username>). Following
// someone keeps their wall a click away. (Collaboration lives in playlists:
// friends are invited to add tracks there.)
const router = express.Router();

// ── following (2026-10-03) ────────────────────────────────────────────────────
// The people you follow, with how many posts are on their walls and when
// the latest went up.
router.get('/me/following', requireAuth, (req, res, next) => {
  try {
    // Counts include posts they joined (also posted by).
    const rows = db.prepare(`SELECT u.id, u.username, f.created_at AS since
      FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ?`).all(req.user.id)
      .map(r => ({ ...r, ...wallStats(r.id) }))
      .sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
    res.json({ following: rows });
  } catch (err) { next(err); }
});

router.post('/:username/follow', requireAuth, (req, res, next) => {
  try {
    const u = userByName(req.params.username);
    if (!u) return res.status(404).json({ error: 'No such user.' });
    if (u.id === req.user.id) return res.status(400).json({ error: 'That’s you.' });
    db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)').run(req.user.id, u.id);
    res.json({ following: true });
  } catch (err) { next(err); }
});

router.delete('/:username/follow', requireAuth, (req, res, next) => {
  try {
    const u = userByName(req.params.username);
    if (u) db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, u.id);
    res.json({ following: false });
  } catch (err) { next(err); }
});

// What you and a wall's owner both post (alpha, 2026-10-05): shared records,
// artists and labels, rarest first (services/collectionsService.js inCommon).
router.get('/:username/common', requireAuth, (req, res, next) => {
  try {
    const owner = userByName(req.params.username);
    if (!owner) return res.status(404).json({ error: 'No such wall.' });
    if (owner.id === req.user.id) return res.json({ self: true });
    res.json(inCommon(req.user.id, owner.id));
  } catch (err) { next(err); }
});

// Profiles (2026-10-05) — the wall's card (collectionsService profileOf).
// Public; signed in you also get who connects you, or, on your own, the
// editing choices and your private numbers.
router.get('/:username/profile', (req, res, next) => {
  try {
    const owner = userByName(req.params.username);
    if (!owner) return res.status(404).json({ error: 'No such wall.' });
    res.json(profileOf(owner.id, req.user?.id || null));
  } catch (err) { next(err); }
});

// Your bio (up to 280 characters).
router.patch('/me/profile', requireAuth, (req, res, next) => {
  try {
    const bio = String(req.body?.bio ?? '').replace(/\s+/g, ' ').trim().slice(0, 280);
    db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio || null, req.user.id);
    res.json({ bio });
  } catch (err) { next(err); }
});

// Your pinned labels — up to 3, from labels you've posted.
router.put('/me/pins', requireAuth, (req, res, next) => {
  try { res.json({ labels: setProfilePins(req.user.id, req.body?.labels) }); } catch (err) { next(err); }
});

// Show one of your playlists on your profile, or hide it. Shown means
// readable by its share link, so one is made if it has none.
router.put('/me/playlists/:id', requireAuth, (req, res, next) => {
  try {
    const p = db.prepare('SELECT * FROM playlists WHERE id = ? AND owner_id = ?').get(Number(req.params.id), req.user.id);
    if (!p) return res.status(404).json({ error: 'Playlist not found.' });
    const shown = !!req.body?.shown;
    if (shown && !p.share_token) db.prepare('UPDATE playlists SET share_token = ? WHERE id = ?').run(newShareToken(), p.id);
    db.prepare('UPDATE playlists SET on_profile = ? WHERE id = ?').run(shown ? 1 : 0, p.id);
    res.json({ shown });
  } catch (err) { next(err); }
});

// A wall's header: whose it is, how many posts, whether you follow it.
router.get('/:username', (req, res, next) => {
  try {
    const owner = userByName(req.params.username);
    if (!owner) return res.status(404).json({ error: 'No such wall.' });
    const me = req.user?.id || null;
    const isOwner = me === owner.id;
    res.json({
      user_id: owner.id, username: owner.username,
      post_count: wallStats(owner.id).post_count,
      is_owner: isOwner,
      following: !!(me && db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(me, owner.id)),
      follower_count: db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id = ?').get(owner.id).c,
    });
  } catch (err) { next(err); }
});

export default router;
