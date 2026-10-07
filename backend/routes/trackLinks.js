import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { checkLink, addLink, vote } from '../services/trackLinks.js';

// /api/track-links — links people add by hand (services/trackLinks.js).
const router = express.Router();
router.use(requireAuth);

// POST /check { url, title, artist } -> what the link is and whether it fits (nothing is saved).
router.post('/check', async (req, res, next) => {
  try {
    const { url, title, artist } = req.body || {};
    const c = await checkLink({ url, title: String(title || ''), artist: String(artist || '') });
    if (!c.ok) return res.status(422).json({ ok: false, reason: c.reason });
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

// POST /:id/vote { vote: 'ok' | 'bad' }
router.post('/:id/vote', (req, res, next) => {
  try {
    const r = vote(req.user, req.params.id, req.body?.vote);
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r);
  } catch (err) { next(err); }
});

export default router;
