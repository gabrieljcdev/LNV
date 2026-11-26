import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { isAdminUser } from '../services/authService.js';
import { logEvent } from '../services/logService.js';
import { previewLabel, confirmLabel, listCustomLabels, getCustomLabel, lookupCustomLabel, deleteCustomLabel, createdToday, LabelError } from '../services/customLabels.js';

const router = express.Router();

// Adding a label is two steps so a wrong match is caught before it is saved:
//   POST /preview { url }  -> what we read + similar labels we know (nothing saved)
//   POST /confirm { previewId, action: 'new' | 'link', discogsId?, name? }  -> saved only on the person's yes
const PREVIEWS_PER_HOUR = 10, ADDS_PER_DAY = 10;
const recent = new Map(); // userId -> preview timestamps
function previewAllowed(user) {
  if (isAdminUser(user)) return true;
  const now = Date.now(), list = (recent.get(user.id) || []).filter(t => now - t < 3600_000);
  if (list.length >= PREVIEWS_PER_HOUR) return false;
  list.push(now); recent.set(user.id, list);
  return true;
}
const fail = (res, next) => err => (err instanceof LabelError ? res.status(err.status).json({ error: err.message }) : next(err));

router.post('/preview', requireAuth, async (req, res, next) => {
  try {
    if (!previewAllowed(req.user)) return res.status(429).json({ error: 'A few labels at a time. Try again in an hour.' });
    res.json(await previewLabel(req.user, req.body?.url));
  } catch (err) { fail(res, next)(err); }
});

router.post('/confirm', requireAuth, (req, res, next) => {
  try {
    if (!isAdminUser(req.user) && createdToday(req.user.id) >= ADDS_PER_DAY) return res.status(429).json({ error: 'That is the limit of labels you can add in a day.' });
    const label = confirmLabel(req.user, req.body || {});
    logEvent('info', 'labels', `Label added: ${label.name} (${label.url})${label.discogsId ? ` linked to Discogs ${label.discogsId}` : ''}`, { req, user: req.user });
    res.status(201).json({ label });
  } catch (err) { fail(res, next)(err); }
});

// GET /api/labels/lookup?discogs_id= | ?bandcamp=  -> { label } or { label: null }
router.get('/lookup', (req, res) => res.json({ label: lookupCustomLabel({ discogsId: req.query.discogs_id, bandcamp: req.query.bandcamp }) }));

// GET /api/custom-labels -> every label added from Bandcamp, A to Z
router.get('/', (req, res) => res.json({ labels: listCustomLabels(req.user) }));

router.get('/:id', (req, res) => {
  const label = getCustomLabel(Number(req.params.id), req.user);
  if (!label) return res.status(404).json({ error: 'Label not found.' });
  res.json({ label });
});

router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const out = deleteCustomLabel(req.user, Number(req.params.id), isAdminUser(req.user));
    logEvent('info', 'labels', `Label ${out.removed} removed`, { req, user: req.user });
    res.json(out);
  } catch (err) { fail(res, next)(err); }
});

export default router;
