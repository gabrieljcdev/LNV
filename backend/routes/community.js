import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { boardStyles, styleBoard, rangeBoard, boardsOff, setBoardsOff, DAILY_CAP } from '../services/communityService.js';

// /api/community — the Community boards (alpha, 2026-10-06). Public;
// the rules are in services/communityService.js.
const router = express.Router();
const period = q => (q === 'rising' ? 'rising' : 'all');

router.get('/styles', (req, res, next) => {
  try { res.json({ styles: boardStyles(period(req.query.period)) }); } catch (err) { next(err); }
});
router.get('/board', (req, res, next) => {
  try {
    const style = String(req.query.style || '').slice(0, 80);
    if (!style) return res.status(400).json({ error: 'Which style?' });
    res.json({ style, period: period(req.query.period), dailyCap: DAILY_CAP, rows: styleBoard(style, period(req.query.period)) });
  } catch (err) { next(err); }
});
router.get('/range', (req, res, next) => {
  try { res.json({ period: period(req.query.period), rows: rangeBoard(period(req.query.period)) }); } catch (err) { next(err); }
});
// Your choice: on the boards or not (you still see them either way).
router.get('/me', requireAuth, (req, res, next) => {
  try { res.json({ off: boardsOff(req.user.id) }); } catch (err) { next(err); }
});
router.put('/me', requireAuth, (req, res, next) => {
  try { setBoardsOff(req.user.id, !!req.body?.off); res.json({ off: boardsOff(req.user.id) }); } catch (err) { next(err); }
});

export default router;
