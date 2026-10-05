import express from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { memberRole, newShareToken } from '../services/collectionsService.js';

// Shared feeds (2026-10-03): a feed a few friends fill together. Whoever
// makes one owns it; anyone signed in who has its share link can join;
// every member can add posts and remove their own (the owner can remove
// any, rename it, renew the link, remove members or delete the feed).
// Everything is members-only — a feed is invisible to everyone else.
const router = express.Router();
router.use(requireAuth);

const MAX_NAME = 60;
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

function feedSummary(feedId, userId) {
  const f = db.prepare('SELECT * FROM shared_feeds WHERE id = ?').get(feedId);
  if (!f) return null;
  const owner = db.prepare('SELECT username FROM users WHERE id = ?').get(f.owner_id);
  return {
    id: f.id, name: f.name, owner: owner?.username || null, created_at: f.created_at,
    role: memberRole(f.id, userId),
    share_token: f.share_token,
    member_count: db.prepare('SELECT COUNT(*) c FROM shared_feed_members WHERE feed_id = ?').get(f.id).c,
    item_count: db.prepare('SELECT COUNT(*) c FROM shared_feed_items WHERE feed_id = ?').get(f.id).c,
  };
}

// Loads the feed and checks the caller belongs to it (or owns it, with
// ownerOnly). Answers 404 rather than 403 so non-members can't probe ids.
function load(req, res, { ownerOnly = false } = {}) {
  const id = Number(req.params.id);
  const role = memberRole(id, req.user.id);
  if (!role || (ownerOnly && role !== 'owner')) {
    res.status(role ? 403 : 404).json({ error: role ? 'Only the owner can do that.' : 'Feed not found.' });
    return null;
  }
  return id;
}

// Feeds you belong to, newest first.
router.get('/', (req, res, next) => {
  try {
    const ids = db.prepare(`SELECT f.id FROM shared_feeds f JOIN shared_feed_members m ON m.feed_id = f.id AND m.user_id = ?
      ORDER BY f.id DESC`).all(req.user.id).map(r => r.id);
    res.json({ feeds: ids.map(id => feedSummary(id, req.user.id)) });
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the feed a name.' });
    const count = db.prepare('SELECT COUNT(*) c FROM shared_feeds WHERE owner_id = ?').get(req.user.id).c;
    if (count >= 20) return res.status(400).json({ error: 'You can own up to 20 feeds.' });
    const id = db.transaction(() => {
      const r = db.prepare('INSERT INTO shared_feeds (owner_id, name, share_token) VALUES (?, ?, ?)').run(req.user.id, name, newShareToken());
      db.prepare("INSERT INTO shared_feed_members (feed_id, user_id, role) VALUES (?, ?, 'owner')").run(r.lastInsertRowid, req.user.id);
      return r.lastInsertRowid;
    })();
    res.status(201).json(feedSummary(id, req.user.id));
  } catch (err) { next(err); }
});

// What a share link points at, before joining.
router.get('/join/:token', (req, res, next) => {
  try {
    const f = db.prepare('SELECT id FROM shared_feeds WHERE share_token = ?').get(String(req.params.token));
    if (!f) return res.status(404).json({ error: 'That link has expired or is wrong.' });
    const s = feedSummary(f.id, req.user.id);
    res.json({ id: s.id, name: s.name, owner: s.owner, member_count: s.member_count, item_count: s.item_count, joined: !!s.role });
  } catch (err) { next(err); }
});

router.post('/join/:token', (req, res, next) => {
  try {
    const f = db.prepare('SELECT id FROM shared_feeds WHERE share_token = ?').get(String(req.params.token));
    if (!f) return res.status(404).json({ error: 'That link has expired or is wrong.' });
    db.prepare("INSERT OR IGNORE INTO shared_feed_members (feed_id, user_id, role) VALUES (?, ?, 'member')").run(f.id, req.user.id);
    res.json(feedSummary(f.id, req.user.id));
  } catch (err) { next(err); }
});

// One feed with its members.
router.get('/:id', (req, res, next) => {
  try {
    const id = load(req, res); if (!id) return;
    const members = db.prepare(`SELECT u.id, u.username, m.role, m.joined_at,
        (SELECT COUNT(*) FROM shared_feed_items i WHERE i.feed_id = m.feed_id AND i.added_by = u.id) AS added
      FROM shared_feed_members m JOIN users u ON u.id = m.user_id WHERE m.feed_id = ? ORDER BY m.role = 'owner' DESC, m.joined_at`).all(id);
    res.json({ ...feedSummary(id, req.user.id), members });
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    const id = load(req, res, { ownerOnly: true }); if (!id) return;
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the feed a name.' });
    db.prepare('UPDATE shared_feeds SET name = ? WHERE id = ?').run(name, id);
    res.json(feedSummary(id, req.user.id));
  } catch (err) { next(err); }
});

// A new share link; the old one stops working (members stay).
router.post('/:id/link', (req, res, next) => {
  try {
    const id = load(req, res, { ownerOnly: true }); if (!id) return;
    db.prepare('UPDATE shared_feeds SET share_token = ? WHERE id = ?').run(newShareToken(), id);
    res.json(feedSummary(id, req.user.id));
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = load(req, res, { ownerOnly: true }); if (!id) return;
    db.transaction(() => {
      db.prepare('DELETE FROM shared_feed_items WHERE feed_id = ?').run(id);
      db.prepare('DELETE FROM shared_feed_members WHERE feed_id = ?').run(id);
      db.prepare('DELETE FROM shared_feeds WHERE id = ?').run(id);
    })();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/leave', (req, res, next) => {
  try {
    const id = load(req, res); if (!id) return;
    if (memberRole(id, req.user.id) === 'owner') return res.status(400).json({ error: 'The owner can’t leave — delete the feed instead.' });
    db.prepare('DELETE FROM shared_feed_members WHERE feed_id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/members/:userId', (req, res, next) => {
  try {
    const id = load(req, res, { ownerOnly: true }); if (!id) return;
    const uid = Number(req.params.userId);
    if (uid === req.user.id) return res.status(400).json({ error: 'You own this feed.' });
    db.prepare('DELETE FROM shared_feed_members WHERE feed_id = ? AND user_id = ?').run(id, uid);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Which of your feeds already hold a post — for the cards' "add to feed" menu.
router.get('/containing/:postId', (req, res, next) => {
  try {
    const rows = db.prepare(`SELECT i.feed_id FROM shared_feed_items i JOIN shared_feed_members m ON m.feed_id = i.feed_id AND m.user_id = ?
      WHERE i.post_id = ?`).all(req.user.id, Number(req.params.postId));
    res.json({ feed_ids: rows.map(r => r.feed_id) });
  } catch (err) { next(err); }
});

router.post('/:id/items', (req, res, next) => {
  try {
    const id = load(req, res); if (!id) return;
    const postId = Number(req.body?.post_id);
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ? AND is_spotlight = 0').get(postId)) return res.status(404).json({ error: 'Post not found.' });
    db.prepare('INSERT OR IGNORE INTO shared_feed_items (feed_id, post_id, added_by) VALUES (?, ?, ?)').run(id, postId, req.user.id);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/items/:postId', (req, res, next) => {
  try {
    const id = load(req, res); if (!id) return;
    const postId = Number(req.params.postId);
    const item = db.prepare('SELECT added_by FROM shared_feed_items WHERE feed_id = ? AND post_id = ?').get(id, postId);
    if (!item) return res.json({ ok: true });
    if (item.added_by !== req.user.id && memberRole(id, req.user.id) !== 'owner') {
      return res.status(403).json({ error: 'Only whoever added it (or the owner) can take it out.' });
    }
    db.prepare('DELETE FROM shared_feed_items WHERE feed_id = ? AND post_id = ?').run(id, postId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
