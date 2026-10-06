import express from 'express';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import db from '../db/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { readLog, logSummary, logEvent } from '../services/logService.js';
import { quotaUsed, channelsWithVerdicts, setChannelOfficial, PROPER_CHANNEL } from '../services/youtubeService.js';
import { INTRO_WEEK_CAP } from '../services/collectionsService.js';
import { gapCounts, sweepGaps } from '../services/gapSweeper.js';
import { callsToday } from '../services/usageService.js';
import { spotifyConfigured } from '../services/spotifyService.js';
import { lastfmConfigured } from '../services/lastfmService.js';
import {
  mailConfigured, sendTestEmail, createVerifyToken, sendVerifyEmail, createResetToken, sendResetEmail,
} from '../services/authService.js';

// /api/admin — the admin drawer's three tabs (2026-10-02). Admins only.
const router = express.Router();
router.use(requireAuth, requireAdmin);

const startedAt = new Date();
const DB_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'vinyl_crate.db');

// ── Status ──
router.get('/status', (req, res, next) => {
  try {
    const one = sql => db.prepare(sql).get();
    // Names for crawled Discogs ids, from the posts that carry them.
    const artistName = id => db.prepare('SELECT artist_name n FROM post_artists WHERE discogs_artist_id = ? LIMIT 1').get(id)?.n;
    const labelName = id => db.prepare('SELECT label_name n FROM post_labels WHERE discogs_label_id = ? LIMIT 1').get(id)?.n;
    const catalogues = db.prepare(`SELECT c.kind, c.entity_id, c.total, c.pages, c.next_page, c.done, c.crawled_at,
        (SELECT COUNT(*) FROM discogs_catalogue d WHERE d.kind = c.kind AND d.entity_id = c.entity_id) have
      FROM discogs_catalogue_crawl c ORDER BY c.done, c.kind, c.entity_id`).all()
      .map(c => ({ ...c, name: (c.kind === 'artist' ? artistName(c.entity_id) : labelName(c.entity_id)) || `#${c.entity_id}` }));
    const channels = db.prepare(`SELECT c.title, c.total, c.backfill_done done, c.refreshed_at,
        (SELECT COUNT(*) FROM yt_channel_videos v WHERE v.channel_id = c.channel_id) have
      FROM yt_channels c ORDER BY c.backfill_done, c.title`).all();
    const lastMailError = one("SELECT ts, message FROM app_log WHERE kind = 'mail' AND level = 'error' ORDER BY id DESC LIMIT 1") || null;

    res.json({
      server: { startedAt: startedAt.toISOString(), uptimeSec: Math.round(process.uptime()), node: process.version, env: process.env.NODE_ENV || 'development' },
      email: {
        configured: mailConfigured(),
        host: process.env.SMTP_HOST || null,
        port: process.env.SMTP_PORT || null,
        from: process.env.MAIL_FROM || null,
        lastError: lastMailError,
      },
      counts: {
        users: one('SELECT COUNT(*) c FROM users').c,
        usersConfirmed: one('SELECT COUNT(*) c FROM users WHERE email_verified_at IS NOT NULL').c,
        admins: one('SELECT COUNT(*) c FROM users WHERE is_admin = 1').c,
        posts: one('SELECT COUNT(*) c FROM posts WHERE is_spotlight = 0').c,
        comments: one('SELECT COUNT(*) c FROM comments').c,
        sessions: one("SELECT COUNT(*) c FROM sessions WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").c,
      },
      database: { bytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : null, catalogueRows: one('SELECT COUNT(*) c FROM discogs_catalogue').c, channelVideos: one('SELECT COUNT(*) c FROM yt_channel_videos').c },
      youtube: { usedToday: quotaUsed(), dailyCap: Number(process.env.YOUTUBE_DAILY_UNIT_CAP) || 5000, crawlShare: 0.6 },
      crawls: { catalogues, channels },
      gaps: gapCounts(),
      // Each outside service's load today (2026-10-06) — cache hits don't count.
      services: {
        youtube: { used: quotaUsed(), cap: Number(process.env.YOUTUBE_DAILY_UNIT_CAP) || 5000 },
        discogs: { calls: callsToday('discogs') },
        spotify: { calls: callsToday('spotify'), on: spotifyConfigured() },
        lastfm: { calls: callsToday('lastfm'), on: lastfmConfigured() },
      },
      log: logSummary(),
    });
  } catch (err) { next(err); }
});

// Send a test email to the signed-in admin's own address.
router.post('/test-email', async (req, res) => {
  if (!req.user.email) return res.status(400).json({ error: 'Your account has no email address.' });
  try {
    const r = await sendTestEmail(req.user.email);
    res.json({ ok: true, sent: r.sent, to: req.user.email });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Logs ──
router.get('/logs', (req, res, next) => {
  try {
    const { level, kind, q, before, limit } = req.query;
    res.json(readLog({ level, kind, q, before, limit }));
  } catch (err) { next(err); }
});

// ── Gaps (2026-10-06) ──
// What's still missing in the DB, and the gap sweep run on demand (it also
// runs every 6 hours by itself — services/gapSweeper.js).
router.post('/gaps/sweep', async (req, res, next) => {
  try {
    const r = await sweepGaps();
    res.json(r || { busy: true, after: gapCounts() });
  } catch (err) { next(err); }
});

// ── Channels (2026-10-05) ──
// Which channels can be ♥'d and why; mark one official, not, or back to
// the numbers (official: true | false | null).
router.get('/channels', (req, res, next) => {
  try { res.json({ channels: channelsWithVerdicts(), rule: PROPER_CHANNEL }); } catch (err) { next(err); }
});
router.post('/channels/official', (req, res, next) => {
  try {
    const { name, official } = req.body || {};
    if (!setChannelOfficial(name, official === null || official === undefined ? null : !!official)) return res.status(400).json({ error: 'Which channel?' });
    logEvent('info', 'admin', `Channel “${name}”: ${official === null || official === undefined ? 'back to the numbers' : official ? 'marked official' : 'marked not official'}`);
    res.json({ channels: channelsWithVerdicts() });
  } catch (err) { next(err); }
});

// ── Introductions (alpha, 2026-10-05) ──
// Who was introduced to whom and why, over the last 30 days, and what
// came of it: followed since, said no (×), or nothing.
router.get('/introductions', (req, res, next) => {
  try {
    const rows = db.prepare(`SELECT s.id, s.shown_at, s.reason, v.username AS viewer, t.username AS target,
        EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = s.viewer_id AND f.followee_id = s.target_id AND f.created_at >= s.shown_at) AS followed,
        EXISTS (SELECT 1 FROM intro_dismissals d WHERE d.user_id = s.viewer_id AND d.target_id = s.target_id) AS dismissed
      FROM intro_shown s JOIN users v ON v.id = s.viewer_id JOIN users t ON t.id = s.target_id
      WHERE s.shown_at > datetime('now', '-30 days') ORDER BY s.shown_at DESC, s.id DESC LIMIT 200`).all();
    const most = db.prepare(`SELECT t.username, COUNT(DISTINCT s.viewer_id) AS people FROM intro_shown s JOIN users t ON t.id = s.target_id
      WHERE s.shown_at > datetime('now', '-7 days') GROUP BY s.target_id ORDER BY people DESC LIMIT 8`).all();
    res.json({
      rows,
      totals: {
        shown: rows.length,
        followed: rows.filter(r => r.followed).length,
        dismissed: rows.filter(r => r.dismissed).length,
        off: db.prepare('SELECT COUNT(*) c FROM users WHERE intros_off = 1').get().c,
      },
      most, weekCap: INTRO_WEEK_CAP,
    });
  } catch (err) { next(err); }
});

// ── Users ──
router.get('/users', (req, res, next) => {
  try {
    const users = db.prepare(`SELECT u.id, u.username, u.email, u.email_verified_at, u.is_admin, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.is_spotlight = 0) posts,
        (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) comments,
        (u.password_hash IS NOT NULL) has_password
      FROM users u ORDER BY u.is_admin DESC, u.created_at DESC`).all();
    res.json({ users, me: req.user.id });
  } catch (err) { next(err); }
});

// Make or remove an admin. You can't remove your own admin (lockout), and
// there must always be at least one.
router.post('/users/:id/admin', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const admin = !!req.body.admin;
    const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'No such user.' });
    if (!admin && id === req.user.id) return res.status(400).json({ error: "You can't remove your own admin rights." });
    if (!admin && user.is_admin && db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1').get().c <= 1) return res.status(400).json({ error: 'There must always be at least one admin.' });
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(admin ? 1 : 0, id);
    logEvent('warn', 'admin', `${admin ? 'Made' : 'Removed'} admin: ${user.username}`, { req, detail: { target: user.username } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Send a user a new confirmation link, or a password-reset link.
router.post('/users/:id/:mail(confirm|reset)', async (req, res) => {
  const user = db.prepare('SELECT id, username, email, email_verified_at FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user?.email) return res.status(404).json({ error: 'No such user, or no email on the account.' });
  try {
    if (req.params.mail === 'confirm') {
      if (user.email_verified_at) return res.status(400).json({ error: 'That email is already confirmed.' });
      const link = createVerifyToken(user.id);
      const r = await sendVerifyEmail(user, link);
      logEvent('info', 'admin', `Sent a confirmation link to ${user.username}`, { req });
      return res.json({ ok: true, sent: r.sent, ...(r.sent ? {} : { link }) });
    }
    const link = createResetToken(user.id);
    const r = await sendResetEmail(user, link);
    logEvent('info', 'admin', `Sent a password-reset link to ${user.username}`, { req });
    res.json({ ok: true, sent: r.sent, ...(r.sent ? {} : { link }) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
