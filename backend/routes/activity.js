import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logEvent } from '../services/logService.js';
import { keepsListening, setKeepListening, recordListening, recentListening, listeningSummary, exportActivity, clearListening, deleteUserActivity } from '../services/listeningHistory.js';

// /api/activity — your own listening history (services/listeningHistory.js). Off until you turn it on; private to you.
const router = express.Router();
router.use(requireAuth);

// GET /me/settings -> { keep_listening }      PUT /me/settings { keep_listening: true|false, clear?: true }
router.get('/me/settings', (req, res) => res.json({ keep_listening: keepsListening(req.user.id) }));
router.put('/me/settings', (req, res, next) => {
  try {
    const on = setKeepListening(req.user.id, !!req.body?.keep_listening);
    const cleared = !on && req.body?.clear ? clearListening(req.user.id) : 0;   // switching off can clear at the same time
    res.json({ keep_listening: on, cleared });
  } catch (err) { next(err); }
});

// POST /listening { events: [{ kind: 'play'|'finish'|'skip', post_id, track_id?, source?, place?, ms_played? }] } -> { recorded } (up to 20 a call)
router.post('/listening', (req, res, next) => {
  try { res.json(recordListening(req.user.id, req.body?.events)); } catch (err) { next(err); }
});

// GET /me/listening?before=<id>&limit=50 -> your recent plays, newest first
router.get('/me/listening', (req, res, next) => {
  try { res.json(recentListening(req.user.id, { before: Number(req.query.before) || null, limit: req.query.limit })); } catch (err) { next(err); }
});
// GET /me/summary?days=90 -> counts and your most-played artists, labels, styles, sources
router.get('/me/summary', (req, res, next) => {
  try { res.json(listeningSummary(req.user.id, req.query.days)); } catch (err) { next(err); }
});
// GET /me/export -> everything held about you in the activity database, as a download
router.get('/me/export', (req, res, next) => {
  try {
    res.set('Content-Disposition', 'attachment; filename="my-activity.json"');
    res.json(exportActivity(req.user.id));
  } catch (err) { next(err); }
});
// DELETE /me/listening -> clear your listening history          DELETE /me -> remove everything held about you here
router.delete('/me/listening', (req, res, next) => {
  try { res.json({ cleared: clearListening(req.user.id) }); } catch (err) { next(err); }
});
router.delete('/me', (req, res, next) => {
  try {
    const removed = deleteUserActivity(req.user.id);
    logEvent('info', 'privacy', `${req.user.username} removed their activity data (${removed} rows)`, { req, user: req.user });
    res.json({ removed });
  } catch (err) { next(err); }
});

export default router;
