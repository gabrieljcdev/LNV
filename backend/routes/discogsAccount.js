import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { status, startLink, verifyLink, startImport, unlink, recordsFor } from '../services/discogsAccount.js';

// Your Discogs collection and wantlist as playlists (2026-10-08) — see services/discogsAccount.js.
const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res, next) => { try { res.json(status(req.user.id)); } catch (err) { next(err); } });

// { username, collection, wantlist } -> the code to paste into the Discogs profile
router.post('/link', (req, res, next) => {
  try {
    const r = startLink(req.user.id, req.body?.username, { collection: req.body?.collection !== false, wantlist: req.body?.wantlist !== false });
    if (r.error) return res.status(400).json(r);
    res.json(r);
  } catch (err) { next(err); }
});

// Reads the Discogs profile for the code; on success the import starts in the background.
router.post('/verify', async (req, res, next) => {
  try {
    const r = await verifyLink(req.user.id);
    if (r.error) return res.status(400).json(r);
    res.json(r);
  } catch (err) { next(err); }
});

// Your imported records with artist / label ids, for the Artists and Labels tabs.
router.get('/records', (req, res, next) => { try { res.json(recordsFor(req.user.id)); } catch (err) { next(err); } });

router.post('/sync', (req, res, next) => {
  try {
    const s = status(req.user.id);
    if (!s.linked || !s.verified) return res.status(400).json({ error: 'Link your Discogs account first.' });
    startImport(req.user.id);
    res.json(status(req.user.id));
  } catch (err) { next(err); }
});

router.delete('/', (req, res, next) => { try { res.json(unlink(req.user.id)); } catch (err) { next(err); } });

export default router;
