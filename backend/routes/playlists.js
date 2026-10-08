import express from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { newShareToken } from '../services/collectionsService.js';
import { releasesFor } from '../services/discogsAccount.js';

// Playlists (2026-10-03): lists of tracks picked from posts and spotlights.
// - The owner can share a read-only link (share_token): anyone with it can
//   listen, signed in or not, and view the playlist as a feed.
// - The owner can invite friends with a second link (invite_token); whoever
//   joins can add, remove and reorder tracks (playlist_members).
const router = express.Router();

const MAX_NAME = 60;
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
const str = (v, n = 500) => (v == null || v === '' ? null : String(v).slice(0, n));

// 'owner' | 'member' | null
export function playlistRole(p, userId) {
  if (!p || !userId) return null;
  if (p.owner_id === userId) return 'owner';
  return db.prepare('SELECT 1 FROM playlist_members WHERE playlist_id = ? AND user_id = ?').get(p.id, userId) ? 'member' : null;
}

const tracksOf = id => db.prepare('SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY sort, id').all(id);
const isReleaseList = p => p?.kind === 'collection' || p?.kind === 'wantlist';

function summary(p, userId) {
  const role = playlistRole(p, userId);
  return {
    id: p.id, name: p.name, kind: p.kind, created_at: p.created_at, is_default: !!p.is_default,
    owner: db.prepare('SELECT username FROM users WHERE id = ?').get(p.owner_id)?.username || null,
    role,
    share_token: role === 'owner' ? p.share_token : (role ? p.share_token : undefined),
    invite_token: role === 'owner' ? p.invite_token : undefined,
    track_count: db.prepare('SELECT COUNT(*) c FROM playlist_tracks WHERE playlist_id = ?').get(p.id).c,
    member_count: db.prepare('SELECT COUNT(*) c FROM playlist_members WHERE playlist_id = ?').get(p.id).c,
    // Discogs collection / wantlist playlists hold releases, not tracks (services/discogsAccount.js).
    ...(isReleaseList(p) ? { release_count: db.prepare('SELECT COUNT(*) c FROM playlist_releases WHERE playlist_id = ?').get(p.id).c } : {}),
    covers: isReleaseList(p)
      ? db.prepare('SELECT cover FROM playlist_releases WHERE playlist_id = ? AND cover IS NOT NULL ORDER BY added_at DESC LIMIT 3').all(p.id).map(r => r.cover)
      : db.prepare('SELECT cover FROM playlist_tracks WHERE playlist_id = ? AND cover IS NOT NULL ORDER BY sort LIMIT 3').all(p.id).map(r => r.cover),
  };
}

function addTracks(playlistId, list) {
  const have = new Set(db.prepare('SELECT url FROM playlist_tracks WHERE playlist_id = ?').all(playlistId).map(r => r.url));
  let sort = (db.prepare('SELECT MAX(sort) m FROM playlist_tracks WHERE playlist_id = ?').get(playlistId).m ?? -1) + 1;
  const ins = db.prepare(`INSERT INTO playlist_tracks (playlist_id, post_id, position, title, artist, url, embed_url, duration, cover, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let added = 0;
  db.transaction(() => {
    for (const t of list.slice(0, 200)) {
      const url = str(t?.url, 1000), title = str(t?.title, 300);
      if (!url || !title || have.has(url) || !/^https?:\/\//i.test(url)) continue;
      ins.run(playlistId, Number(t.post_id) || null, str(t.position, 20), title, str(t.artist, 300), url, str(t.embed_url, 1000), str(t.duration, 20), str(t.cover, 1000), sort++);
      have.add(url); added++;
    }
  })();
  return { added, skipped: list.length - added };
}

// The posts a playlist's tracks come from, in playlist order (first
// appearance), each numbered by its place in that list — "view as feed".
export function playlistFeedPostIds(playlistId) {
  const seen = new Set();
  const ids = [];
  for (const t of tracksOf(playlistId)) {
    if (t.post_id && !seen.has(t.post_id)) { seen.add(t.post_id); ids.push(t.post_id); }
  }
  return ids;
}

// ── public: a shared playlist by its read-only link ──────────────────────────
router.get('/shared/:token', (req, res, next) => {
  try {
    const p = db.prepare('SELECT * FROM playlists WHERE share_token = ?').get(String(req.params.token));
    if (!p) return res.status(404).json({ error: 'That playlist link has expired or is wrong.' });
    res.json({ ...summary(p, req.user?.id), tracks: tracksOf(p.id), via_link: true });
  } catch (err) { next(err); }
});

router.use(requireAuth);

function load(req, res, need = 'member') {
  const p = db.prepare('SELECT * FROM playlists WHERE id = ?').get(Number(req.params.id));
  const role = playlistRole(p, req.user.id);
  if (!role || (need === 'owner' && role !== 'owner')) {
    res.status(role ? 403 : 404).json({ error: role ? 'Only the owner can do that.' : 'Playlist not found.' });
    return null;
  }
  return p;
}

// Yours and the ones you've been invited to, newest first.
// Everyone has a default playlist — made the first time it's needed.
export function ensureDefaultPlaylist(userId) {
  const have = db.prepare('SELECT id FROM playlists WHERE owner_id = ? AND is_default = 1').get(userId);
  if (have) return have.id;
  return db.prepare("INSERT INTO playlists (owner_id, name, is_default, on_profile, share_token) VALUES (?, 'My playlist', 1, 1, ?)").run(userId, newShareToken()).lastInsertRowid;
}

router.get('/', (req, res, next) => {
  try {
    ensureDefaultPlaylist(req.user.id);
    // Your default first, then the newest.
    const rows = db.prepare(`SELECT p.* FROM playlists p
      WHERE p.owner_id = ? OR EXISTS (SELECT 1 FROM playlist_members m WHERE m.playlist_id = p.id AND m.user_id = ?)
      ORDER BY (p.owner_id = ? AND p.is_default = 1) DESC, p.id DESC`).all(req.user.id, req.user.id, req.user.id);
    res.json({ playlists: rows.map(p => summary(p, req.user.id)) });
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  try {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the playlist a name.' });
    // Public from the start for now — on the profile, readable by link (2026-10-06).
    const r = db.prepare('INSERT INTO playlists (owner_id, name, on_profile, share_token) VALUES (?, ?, 1, ?)').run(req.user.id, name, newShareToken());
    res.status(201).json(summary(db.prepare('SELECT * FROM playlists WHERE id = ?').get(r.lastInsertRowid), req.user.id));
  } catch (err) { next(err); }
});

// ── joining by invite ─────────────────────────────────────────────────────────
router.get('/join/:token', (req, res, next) => {
  try {
    const p = db.prepare('SELECT * FROM playlists WHERE invite_token = ?').get(String(req.params.token));
    if (!p) return res.status(404).json({ error: 'That invite has expired or is wrong.' });
    const s = summary(p, req.user.id);
    res.json({ id: s.id, name: s.name, owner: s.owner, track_count: s.track_count, joined: !!s.role });
  } catch (err) { next(err); }
});

router.post('/join/:token', (req, res, next) => {
  try {
    const p = db.prepare('SELECT * FROM playlists WHERE invite_token = ?').get(String(req.params.token));
    if (!p) return res.status(404).json({ error: 'That invite has expired or is wrong.' });
    if (p.owner_id !== req.user.id) db.prepare('INSERT OR IGNORE INTO playlist_members (playlist_id, user_id) VALUES (?, ?)').run(p.id, req.user.id);
    res.json(summary(p, req.user.id));
  } catch (err) { next(err); }
});

// ── one playlist ──────────────────────────────────────────────────────────────
router.get('/:id', (req, res, next) => {
  try {
    const p = load(req, res); if (!p) return;
    const members = db.prepare(`SELECT u.id, u.username, m.joined_at FROM playlist_members m JOIN users u ON u.id = m.user_id
      WHERE m.playlist_id = ? ORDER BY m.joined_at`).all(p.id);
    res.json({ ...summary(p, req.user.id), tracks: tracksOf(p.id), members });
  } catch (err) { next(err); }
});

// The records of a Discogs collection / wantlist playlist (services/discogsAccount.js):
// ?offset=&limit=&q= -> { total, releases: [{ discogs_id, title, artist, label, year, format, cover, playable }] }
router.get('/:id/releases', (req, res, next) => {
  try {
    const p = load(req, res); if (!p) return;
    if (!isReleaseList(p)) return res.json({ total: 0, releases: [] });
    res.json(releasesFor(p.id, { offset: req.query.offset, limit: req.query.limit, q: req.query.q }));
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res, next) => {
  try {
    const p = load(req, res, 'owner'); if (!p) return;
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the playlist a name.' });
    db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, p.id);
    res.json(summary({ ...p, name }, req.user.id));
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    const p = load(req, res, 'owner'); if (!p) return;
    if (isReleaseList(p)) return res.status(400).json({ error: 'This list comes from your Discogs account — disconnect Discogs to remove it.' });
    if (p.is_default) return res.status(400).json({ error: 'Your default playlist can’t be deleted — rename it, or empty it, instead.' });
    db.transaction(() => {
      db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(p.id);
      db.prepare('DELETE FROM playlist_members WHERE playlist_id = ?').run(p.id);
      db.prepare('DELETE FROM playlists WHERE id = ?').run(p.id);
    })();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// The read-only share link (made on first use; `renew` replaces it).
router.post('/:id/share', (req, res, next) => {
  try {
    const p = load(req, res, 'owner'); if (!p) return;
    if (isReleaseList(p)) return res.status(400).json({ error: 'Your Discogs lists are private for now — sharing them isn’t switched on yet.' });
    const token = !p.share_token || req.body?.renew ? newShareToken() : p.share_token;
    db.prepare('UPDATE playlists SET share_token = ? WHERE id = ?').run(token, p.id);
    res.json({ share_token: token });
  } catch (err) { next(err); }
});

// The invite link for friends to add tracks (same rules).
router.post('/:id/invite', (req, res, next) => {
  try {
    const p = load(req, res, 'owner'); if (!p) return;
    if (isReleaseList(p)) return res.status(400).json({ error: 'Your Discogs lists are private for now — sharing them isn’t switched on yet.' });
    const token = !p.invite_token || req.body?.renew ? newShareToken() : p.invite_token;
    db.prepare('UPDATE playlists SET invite_token = ? WHERE id = ?').run(token, p.id);
    res.json({ invite_token: token });
  } catch (err) { next(err); }
});

router.post('/:id/leave', (req, res, next) => {
  try {
    const p = load(req, res); if (!p) return;
    db.prepare('DELETE FROM playlist_members WHERE playlist_id = ? AND user_id = ?').run(p.id, req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/members/:userId', (req, res, next) => {
  try {
    const p = load(req, res, 'owner'); if (!p) return;
    db.prepare('DELETE FROM playlist_members WHERE playlist_id = ? AND user_id = ?').run(p.id, Number(req.params.userId));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── tracks (owner and invited friends) ────────────────────────────────────────
router.post('/:id/tracks', (req, res, next) => {
  try {
    const p = load(req, res); if (!p) return;
    if (isReleaseList(p)) return res.status(400).json({ error: 'This list comes from your Discogs account — its records can’t be edited here.' });
    const list = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
    res.status(201).json(addTracks(p.id, list));
  } catch (err) { next(err); }
});

router.delete('/:id/tracks/:trackId', (req, res, next) => {
  try {
    const p = load(req, res); if (!p) return;
    db.prepare('DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?').run(Number(req.params.trackId), p.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Move a track one place up (-1) or down (+1).
router.post('/:id/tracks/:trackId/move', (req, res, next) => {
  try {
    const p = load(req, res); if (!p) return;
    const rows = tracksOf(p.id).map(r => r.id);
    const i = rows.indexOf(Number(req.params.trackId));
    const j = i + (Number(req.body?.dir) < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= rows.length) return res.json({ ok: true });
    [rows[i], rows[j]] = [rows[j], rows[i]];
    const upd = db.prepare('UPDATE playlist_tracks SET sort = ? WHERE id = ?');
    db.transaction(() => rows.forEach((id, k) => upd.run(k, id)))();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
