import express from 'express';
import db from '../db/database.js';
import crypto from 'crypto';

const router = express.Router();

// ── HELPERS ───────────────────────────────────────────────────────────────────

function getCrateWithMeta(id) {
  const crate = db.prepare(`
    SELECT c.*, u.username AS author,
      (SELECT COUNT(*) FROM crate_records WHERE crate_id = c.id) AS record_count,
      (SELECT COUNT(*) FROM crate_collaborators WHERE crate_id = c.id AND status = 'accepted') AS member_count,
      (SELECT COUNT(*) FROM crate_follows WHERE crate_id = c.id) AS follower_count,
      (SELECT COUNT(*) FROM crate_likes WHERE crate_id = c.id) AS like_count
    FROM crates c JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(id);
  if (!crate) return null;

  // Cover mosaic — first 4 record cover images
  const covers = db.prepare(`
    SELECT p.cover_image, p.thumb_image FROM crate_records cr
    JOIN posts p ON p.id = cr.post_id
    WHERE cr.crate_id = ? AND (p.cover_image IS NOT NULL OR p.thumb_image IS NOT NULL)
    ORDER BY cr.added_at DESC LIMIT 4
  `).all(id).map(r => r.cover_image || r.thumb_image);

  const members = db.prepare(`
    SELECT u.username, u.display_name, u.avatar_url, cc.role, cc.status
    FROM crate_collaborators cc JOIN users u ON u.id = cc.user_id
    WHERE cc.crate_id = ? ORDER BY cc.invited_at ASC
  `).all(id);

  const genres = db.prepare(`
    SELECT g.genre, COUNT(*) AS count FROM post_genres g
    JOIN crate_records cr ON cr.post_id = g.post_id
    WHERE cr.crate_id = ? GROUP BY g.genre ORDER BY count DESC LIMIT 6
  `).all(id).map(r => r.genre);

  return { ...crate, covers, members, genres };
}

// ── PUBLIC DIRECTORY ──────────────────────────────────────────────────────────

router.get('/public', (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const crates = db.prepare(`
    SELECT c.*, u.username AS author,
      (SELECT COUNT(*) FROM crate_records WHERE crate_id = c.id) AS record_count,
      (SELECT COUNT(*) FROM crate_likes WHERE crate_id = c.id) AS like_count,
      (SELECT COUNT(*) FROM crate_follows WHERE crate_id = c.id) AS follower_count,
      (SELECT COUNT(*) FROM crate_collaborators WHERE crate_id = c.id AND status='accepted') AS member_count
    FROM crates c JOIN users u ON u.id = c.user_id
    WHERE c.is_public = 1
    ORDER BY like_count DESC, c.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(Number(limit), Number(offset));

  // Attach cover mosaics
  const result = crates.map(c => {
    const covers = db.prepare(`
      SELECT p.cover_image, p.thumb_image FROM crate_records cr
      JOIN posts p ON p.id = cr.post_id
      WHERE cr.crate_id = ? AND (p.cover_image IS NOT NULL OR p.thumb_image IS NOT NULL)
      ORDER BY cr.added_at DESC LIMIT 4
    `).all(c.id).map(r => r.cover_image || r.thumb_image);
    return { ...c, covers };
  });

  res.json(result);
});

// ── MY CRATES ─────────────────────────────────────────────────────────────────

router.get('/mine', (req, res) => {
  const { username } = req.query;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Own crates + crates they're a collaborator on
  const crates = db.prepare(`
    SELECT DISTINCT c.*, u.username AS author,
      (SELECT COUNT(*) FROM crate_records WHERE crate_id = c.id) AS record_count,
      (SELECT COUNT(*) FROM crate_collaborators WHERE crate_id = c.id AND status='accepted') AS member_count,
      CASE WHEN c.user_id = ? THEN 'owner' ELSE cc2.role END AS my_role
    FROM crates c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN crate_collaborators cc2 ON cc2.crate_id = c.id AND cc2.user_id = ?
    WHERE c.user_id = ? OR (cc2.user_id = ? AND cc2.status = 'accepted')
    ORDER BY c.is_pinned DESC, c.updated_at DESC
  `).all(user.id, user.id, user.id, user.id);

  const result = crates.map(c => {
    const covers = db.prepare(`
      SELECT p.cover_image, p.thumb_image FROM crate_records cr
      JOIN posts p ON p.id = cr.post_id
      WHERE cr.crate_id = ? AND (p.cover_image IS NOT NULL OR p.thumb_image IS NOT NULL)
      ORDER BY cr.added_at DESC LIMIT 4
    `).all(c.id).map(r => r.cover_image || r.thumb_image);
    return { ...c, covers };
  });

  res.json(result);
});

router.get('/logs/mine', (req, res) => {
  const { username } = req.query;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const logs = db.prepare(`
    SELECT a.*, c.name AS crate_name, u.username AS actor
    FROM crate_activity a JOIN crates c ON c.id = a.crate_id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE c.user_id = ? ORDER BY a.created_at DESC LIMIT 100
  `).all(user.id);
  res.json(logs);
});

// ── SINGLE CRATE ──────────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const crate = getCrateWithMeta(req.params.id);
  if (!crate) return res.status(404).json({ error: 'Not found' });

  const records = db.prepare(`
    SELECT p.*, cr.added_at,
      (SELECT artist_name FROM post_artists WHERE post_id = p.id LIMIT 1) AS artist
    FROM crate_records cr JOIN posts p ON p.id = cr.post_id
    WHERE cr.crate_id = ? ORDER BY cr.added_at DESC
  `).all(crate.id);

  res.json({ ...crate, records });
});

// ── CREATE / UPDATE / DELETE ──────────────────────────────────────────────────

router.post('/', (req, res) => {
  const { username, name, description, is_public } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const result = db.prepare(`
    INSERT INTO crates (user_id, name, description, is_public)
    VALUES (?, ?, ?, ?)
  `).run(user.id, name, description || '', is_public ? 1 : 0);
  db.prepare(`INSERT OR IGNORE INTO crate_activity (crate_id, user_id, event_type, detail)
    VALUES (?, ?, 'created', ?)`).run(result.lastInsertRowid, user.id, name);
  res.json({ id: result.lastInsertRowid, name });
});

router.patch('/:id', (req, res) => {
  const { name, description, is_public, is_pinned, cover_image } = req.body;
  db.prepare(`UPDATE crates SET
    name=COALESCE(?,name), description=COALESCE(?,description),
    is_public=COALESCE(?,is_public), is_pinned=COALESCE(?,is_pinned),
    cover_image=COALESCE(?,cover_image), updated_at=datetime('now')
    WHERE id=?`
  ).run(name??null, description??null, is_public??null, is_pinned??null, cover_image??null, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM crates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── RECORDS ───────────────────────────────────────────────────────────────────

router.post('/:id/records', (req, res) => {
  const { post_id } = req.body;
  try {
    db.prepare('INSERT INTO crate_records (crate_id, post_id) VALUES (?, ?)').run(req.params.id, post_id);
    db.prepare("UPDATE crates SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch { res.status(409).json({ error: 'Already in crate' }); }
});

router.delete('/:id/records/:post_id', (req, res) => {
  db.prepare('DELETE FROM crate_records WHERE crate_id = ? AND post_id = ?').run(req.params.id, req.params.post_id);
  res.json({ success: true });
});

// ── INVITES ───────────────────────────────────────────────────────────────────

// Create an invite link
router.post('/:id/invites', (req, res) => {
  const { username, role = 'contributor', max_uses, expires_hours } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const token = crypto.randomBytes(16).toString('hex');
  const expires_at = expires_hours
    ? new Date(Date.now() + expires_hours * 3600000).toISOString()
    : null;

  db.prepare(`INSERT INTO crate_invites (crate_id, token, created_by, role, max_uses, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(req.params.id, token, user.id, role, max_uses || null, expires_at);

  res.json({ token, invite_url: `/join/${token}` });
});

// Accept an invite via token
router.post('/join/:token', (req, res) => {
  const { username } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const invite = db.prepare('SELECT * FROM crate_invites WHERE token = ?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid invite link' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });
  if (invite.max_uses && invite.uses >= invite.max_uses) return res.status(410).json({ error: 'Invite has reached max uses' });

  try {
    db.prepare(`INSERT INTO crate_collaborators (crate_id, user_id, role, status, invited_by)
      VALUES (?, ?, ?, 'accepted', ?)`).run(invite.crate_id, user.id, invite.role, invite.created_by);
    db.prepare('UPDATE crate_invites SET uses = uses + 1 WHERE id = ?').run(invite.id);
    db.prepare(`INSERT INTO crate_activity (crate_id, user_id, event_type)
      VALUES (?, ?, 'member_joined')`).run(invite.crate_id, user.id);
    const crate = db.prepare('SELECT * FROM crates WHERE id = ?').get(invite.crate_id);
    res.json({ success: true, crate_id: invite.crate_id, crate_name: crate?.name });
  } catch {
    res.status(409).json({ error: 'Already a member' });
  }
});

// List invite links for a crate
router.get('/:id/invites', (req, res) => {
  const invites = db.prepare(`
    SELECT i.*, u.username AS created_by_username
    FROM crate_invites i JOIN users u ON u.id = i.created_by
    WHERE i.crate_id = ? ORDER BY i.created_at DESC
  `).all(req.params.id);
  res.json(invites);
});

// ── FOLLOWS & LIKES ───────────────────────────────────────────────────────────

router.post('/:id/follow', (req, res) => {
  const { username } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  try {
    db.prepare('INSERT INTO crate_follows (crate_id, user_id) VALUES (?, ?)').run(req.params.id, user.id);
    res.json({ following: true });
  } catch { res.status(409).json({ error: 'Already following' }); }
});

router.delete('/:id/follow', (req, res) => {
  const { username } = req.query;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM crate_follows WHERE crate_id = ? AND user_id = ?').run(req.params.id, user.id);
  res.json({ following: false });
});

router.post('/:id/like', (req, res) => {
  const { username } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  try {
    db.prepare('INSERT INTO crate_likes (crate_id, user_id) VALUES (?, ?)').run(req.params.id, user.id);
    res.json({ liked: true });
  } catch { res.status(409).json({ error: 'Already liked' }); }
});

// ── TRACKS ────────────────────────────────────────────────────────────────────

router.get('/:id/tracks', (req, res) => {
  const tracks = db.prepare(`
    SELECT ct.*, pt.title, pt.position, pt.duration, pt.youtube_url, pt.stream_url,
      p.title AS album_title, p.year,
      (SELECT artist_name FROM post_artists WHERE post_id = pt.post_id LIMIT 1) AS artist_name
    FROM crate_tracks ct JOIN post_tracks pt ON pt.id = ct.track_id
    JOIN posts p ON p.id = pt.post_id
    WHERE ct.crate_id = ? ORDER BY ct.added_at DESC
  `).all(req.params.id);
  res.json(tracks);
});

router.post('/:id/tracks', (req, res) => {
  const { track_id } = req.body;
  try {
    db.prepare('INSERT INTO crate_tracks (crate_id, track_id) VALUES (?, ?)').run(req.params.id, track_id);
    db.prepare("UPDATE crates SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch { res.status(409).json({ error: 'Already in crate' }); }
});

router.delete('/:id/tracks/:track_id', (req, res) => {
  db.prepare('DELETE FROM crate_tracks WHERE crate_id = ? AND track_id = ?').run(req.params.id, req.params.track_id);
  res.json({ success: true });
});

// ── COMMENTS ──────────────────────────────────────────────────────────────────

router.get('/:id/comments/:post_id', (req, res) => {
  const comments = db.prepare(`
    SELECT cc.*, u.username FROM crate_comments cc
    JOIN users u ON u.id = cc.user_id
    WHERE cc.crate_id = ? AND cc.post_id = ? ORDER BY cc.created_at ASC
  `).all(req.params.id, req.params.post_id);
  res.json(comments);
});

router.post('/:id/comments/:post_id', (req, res) => {
  const { username, body } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user || !body) return res.status(400).json({ error: 'Invalid data' });
  const result = db.prepare(`INSERT INTO crate_comments (crate_id, post_id, user_id, body) VALUES (?, ?, ?, ?)`)
    .run(req.params.id, req.params.post_id, user.id, body);
  res.json({ id: result.lastInsertRowid, body, username });
});

export default router;
