import express from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db/database.js';
import { logEvent } from '../services/logService.js';

// Reports and takedowns (2026-10-06, the legal pass). Anyone — signed in or
// not — can report a post: a copyright / takedown request, spam, something
// offensive, or wrong details. They land in Admin → Reports, where an admin
// removes the post or closes the report. Copyright requests need a contact
// email so the rights holder can be answered (the terms page explains the
// process).

db.exec(`CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  reason TEXT NOT NULL,
  details TEXT,
  contact_email TEXT,
  reporter_user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now')),
  handled_at TEXT
)`);

export const REPORT_REASONS = ['copyright', 'spam', 'offensive', 'wrong-info', 'other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many reports from here — try again later, or email us.' } });

router.post('/', limiter, (req, res, next) => {
  try {
    const { post_id, reason, details = '', contact_email = '' } = req.body || {};
    if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Pick a reason.' });
    const post = post_id ? db.prepare('SELECT id, title FROM posts WHERE id = ?').get(Number(post_id)) : null;
    if (post_id && !post) return res.status(404).json({ error: 'That post isn’t there any more.' });
    const email = String(contact_email || '').trim().slice(0, 200);
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'That email doesn’t look right.' });
    if (reason === 'copyright' && !email && !req.user?.email) return res.status(400).json({ error: 'For a copyright request we need an email to answer you.' });
    const text = String(details || '').trim().slice(0, 2000);
    if (reason === 'copyright' && text.length < 20) return res.status(400).json({ error: 'Say who you are and what you own (the work, and your right to it).' });
    const r = db.prepare('INSERT INTO reports (post_id, reason, details, contact_email, reporter_user_id) VALUES (?, ?, ?, ?, ?)')
      .run(post?.id || null, reason, text || null, email || req.user?.email || null, req.user?.id || null);
    logEvent('warn', 'report', `Report #${r.lastInsertRowid}: ${reason}${post ? ` on post #${post.id} (${post.title})` : ''}`, { req });
    res.status(201).json({ ok: true, id: r.lastInsertRowid });
  } catch (err) { next(err); }
});

export default router;
