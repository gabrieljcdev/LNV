import express from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { FAV_KINDS, nameKey } from '../services/collectionsService.js';

// Favourites (2026-10-03): artists, labels and records you save while
// digging. Your own list only — every route is signed-in and scoped to
// req.user. The list doubles as a digging history (created_at, and the post
// each one was saved from).
const router = express.Router();
router.use(requireAuth);

const toItem = r => ({
  id: r.id, kind: r.kind, key: r.item_key, name: r.name,
  discogs_id: r.discogs_id, post_id: r.post_id, source_post_id: r.source_post_id,
  meta: r.meta ? JSON.parse(r.meta) : {}, created_at: r.created_at,
});

// The record key forms the client may send.
const RECORD_KEY = /^(post|release|master):\d+$/;

function cleanKey(kind, key, name) {
  if (kind === 'record') return RECORD_KEY.test(String(key || '')) ? String(key) : null;
  return nameKey(name || key) || null;
}

router.get('/', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM favourites WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(req.user.id);
    res.json({ items: rows.map(toItem) });
  } catch (err) { next(err); }
});

// Save one. Saving it again updates its details and keeps the first date.
router.post('/', (req, res, next) => {
  try {
    const { kind, key, name, discogs_id, post_id, source_post_id, meta } = req.body || {};
    if (!FAV_KINDS.has(kind)) return res.status(400).json({ error: 'Unknown kind.' });
    const itemKey = cleanKey(kind, key, name);
    const label = String(name || '').trim().slice(0, 300);
    if (!itemKey || !label) return res.status(400).json({ error: 'Missing name.' });
    const recordPost = kind === 'record' && itemKey.startsWith('post:') ? Number(itemKey.slice(5)) : (Number(post_id) || null);
    const metaJson = meta && typeof meta === 'object' ? JSON.stringify(meta).slice(0, 2000) : null;
    db.prepare(`
      INSERT INTO favourites (user_id, kind, item_key, name, discogs_id, post_id, source_post_id, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, kind, item_key) DO UPDATE SET
        name = excluded.name,
        discogs_id = COALESCE(excluded.discogs_id, favourites.discogs_id),
        post_id = COALESCE(excluded.post_id, favourites.post_id),
        meta = COALESCE(excluded.meta, favourites.meta)
    `).run(req.user.id, kind, itemKey, label, Number(discogs_id) || null, recordPost, Number(source_post_id) || null, metaJson);
    const row = db.prepare('SELECT * FROM favourites WHERE user_id = ? AND kind = ? AND item_key = ?').get(req.user.id, kind, itemKey);
    res.status(201).json(toItem(row));
  } catch (err) { next(err); }
});

router.delete('/', (req, res, next) => {
  try {
    const { kind, key, name } = req.body || {};
    if (!FAV_KINDS.has(kind)) return res.status(400).json({ error: 'Unknown kind.' });
    const itemKey = cleanKey(kind, key, name);
    if (!itemKey) return res.status(400).json({ error: 'Missing key.' });
    db.prepare('DELETE FROM favourites WHERE user_id = ? AND kind = ? AND item_key = ?').run(req.user.id, kind, itemKey);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Fresh from your favourites: the newest releases in the crawled Discogs
// catalogues of the artists and labels you favourite (only those linked to
// Discogs). Newest year first; a release already posted carries its post id.
router.get('/fresh', (req, res, next) => {
  try {
    const favs = db.prepare(`SELECT kind, discogs_id, name FROM favourites
      WHERE user_id = ? AND kind IN ('artist', 'label') AND discogs_id IS NOT NULL`).all(req.user.id);
    if (!favs.length) return res.json({ releases: [], linked: 0 });
    const cond = favs.map(() => '(c.kind = ? AND c.entity_id = ?)').join(' OR ');
    const rows = db.prepare(`
      SELECT c.kind, c.entity_id, c.item_type, c.item_id, c.title, c.year, c.thumb, c.artist, c.label, c.format, c.catno, c.role,
        (SELECT p.id FROM posts p WHERE p.discogs_id = c.item_id AND c.item_type = 'release' LIMIT 1) AS post_id
      FROM discogs_catalogue c
      WHERE (${cond}) AND c.year IS NOT NULL AND c.year > 0
      ORDER BY c.year DESC, c.item_id DESC LIMIT 400
    `).all(...favs.flatMap(f => [f.kind, f.discogs_id]));
    const via = new Map(favs.map(f => [`${f.kind}:${f.discogs_id}`, f.name]));
    const seen = new Set();
    const releases = [];
    for (const r of rows) {
      const k = `${r.item_type}:${r.item_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      releases.push({
        type: r.item_type, id: r.item_id, title: r.title, year: r.year, thumb: r.thumb,
        artist: r.artist, label: r.label, format: r.format, catno: r.catno,
        via: via.get(`${r.kind}:${r.entity_id}`) || null, via_kind: r.kind, post_id: r.post_id || null,
      });
      if (releases.length >= 60) break;
    }
    res.json({ releases, linked: favs.length });
  } catch (err) { next(err); }
});

export default router;
