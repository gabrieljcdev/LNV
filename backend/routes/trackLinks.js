import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { checkLink, addLink, vote } from '../services/trackLinks.js';
import { reportLink, replaceLink, withdrawReport } from '../services/badLinks.js';

// /api/track-links — links people add by hand (services/trackLinks.js).
const router = express.Router();
router.use(requireAuth);

// POST /check { url, title, artist } -> what the link is and whether it fits (nothing is saved).
router.post('/check', async (req, res, next) => {
  try {
    const { url, title, artist } = req.body || {};
    const c = await checkLink({ url, title: String(title || ''), artist: String(artist || '') });
    if (!c.ok) return res.status(422).json({ ok: false, reason: c.reason, ...(c.meta?.title ? { title: c.meta.title } : {}) });
    res.json({ ok: true, platform: c.platform, title: c.meta.title, author: c.meta.author, thumb: c.meta.thumb, verdict: c.verdict, reason: c.reason });
  } catch (err) { next(err); }
});

// POST / { release_id, position, url, title, artist } -> saved as live or pending.
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const r = await addLink(req.user, { releaseId: b.release_id, position: b.position, url: b.url, title: b.title, artist: b.artist });
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  } catch (err) { next(err); }
});

// "Wrong link? Change it" (services/badLinks.js): a link that plays but is the wrong track.
// POST /report  { release_id, position, url, title, artist, reason? } -> { status: 'reported' | 'flagged', reports, id }
router.post('/report', (req, res, next) => {
  try {
    const b = req.body || {};
    const r = reportLink(req.user, { releaseId: b.release_id, position: b.position, url: b.url, title: b.title, artist: b.artist, reason: b.reason });
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  } catch (err) { next(err); }
});
// POST /replace { release_id, position, old_url, url, title, artist, reason? } -> the old link reported and the new one added.
router.post('/replace', async (req, res, next) => {
  try {
    const b = req.body || {};
    const r = await replaceLink(req.user, { releaseId: b.release_id, position: b.position, oldUrl: b.old_url, url: b.url, title: b.title, artist: b.artist, reason: b.reason });
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  } catch (err) { next(err); }
});
// DELETE /report/:id -> take your own report back
router.delete('/report/:id', (req, res, next) => {
  try {
    const r = withdrawReport(req.user, req.params.id);
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  } catch (err) { next(err); }
});

// POST /:id/vote { vote: 'ok' | 'bad' }
router.post('/:id/vote', (req, res, next) => {
  try {
    const r = vote(req.user, req.params.id, req.body?.vote);
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  } catch (err) { next(err); }
});

export default router;
