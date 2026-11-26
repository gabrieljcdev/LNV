import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listFor, unreadCount, markRead } from '../services/notifications.js';

// /api/notifications — what happened to you: followed, tagged, replied to, kept (services/notifications.js).
const router = express.Router();
router.use(requireAuth);

// GET /?before=<id>&limit=30 -> { notifications, unread, hasMore, cursor }
router.get('/', (req, res, next) => {
  try { res.json(listFor(req.user.id, { before: Number(req.query.before) || null, limit: req.query.limit })); } catch (err) { next(err); }
});

// GET /unread-count -> { unread } (cheap enough to poll)
router.get('/unread-count', (req, res, next) => {
  try { res.json({ unread: unreadCount(req.user.id) }); } catch (err) { next(err); }
});

// POST /read { ids: [1, 2] } or { all: true } -> { marked, unread }
router.post('/read', (req, res, next) => {
  try {
    const marked = markRead(req.user.id, req.body?.all ? 'all' : req.body?.ids);
    res.json({ marked, unread: unreadCount(req.user.id) });
  } catch (err) { next(err); }
});

export default router;
