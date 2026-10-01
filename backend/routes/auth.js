import express from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import {
  hashPassword, checkPassword, createSession, endSession, publicUser,
  createVerifyToken, consumeVerifyToken, sendVerifyEmail, mailConfigured, frontendUrl,
  USERNAME_RE, EMAIL_RE, PASSWORD_MIN,
} from '../services/authService.js';

// /api/auth — create account, confirm email, sign in / out, who am I.
const router = express.Router();

// Sign-in and sign-up attempts: 20 per 15 minutes per address.
const strict = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

// Without SMTP (local dev) the browser gets the confirmation link back so it
// can be clicked from the page. Never in production.
const devLink = link => (!mailConfigured() && process.env.NODE_ENV !== 'production') ? { devVerifyUrl: link } : {};

router.post('/register', strict, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!USERNAME_RE.test(username)) return res.status(400).json({ field: 'username', error: 'Usernames are 3–24 characters: letters, numbers, . _ or -.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ field: 'email', error: "That doesn't look like an email address." });
    if (password.length < PASSWORD_MIN) return res.status(400).json({ field: 'password', error: `Passwords need at least ${PASSWORD_MIN} characters.` });
    if (db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(username)) return res.status(409).json({ field: 'username', error: 'That username is taken.' });
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) return res.status(409).json({ field: 'email', error: 'There is already an account with that email. Sign in instead.' });

    const id = db.prepare('INSERT INTO users (username, display_name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(username, username, email, hashPassword(password)).lastInsertRowid;
    const link = createVerifyToken(id);
    await sendVerifyEmail({ username, email }, link);
    res.status(201).json({ ok: true, email, ...devLink(link) });
  } catch (err) { next(err); }
});

// The link in the email. Confirms, then sends the browser to the sign-in
// page with the outcome: ?verified=1, or ?verify=expired / invalid.
router.get('/verify', (req, res) => {
  const result = consumeVerifyToken(req.query.token);
  res.redirect(`${frontendUrl()}/login?${result === 'ok' ? 'verified=1' : 'verify=' + result}`);
});

// New confirmation email. Same answer whether or not the address exists, so
// this can't be used to find out who has an account.
router.post('/resend', strict, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = email && db.prepare('SELECT id, username, email, email_verified_at FROM users WHERE lower(email) = ?').get(email);
    let extra = {};
    if (user && !user.email_verified_at) {
      const link = createVerifyToken(user.id);
      await sendVerifyEmail(user, link);
      extra = devLink(link);
    }
    res.json({ ok: true, ...extra });
  } catch (err) { next(err); }
});

// Username or email + password.
router.post('/login', strict, (req, res, next) => {
  try {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');
    const user = login && db.prepare('SELECT * FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)').get(login, login);
    if (!user || !checkPassword(password, user.password_hash)) return res.status(401).json({ error: "That username/email and password don't match." });
    if (!user.email_verified_at) return res.status(403).json({ needsVerification: true, email: user.email, error: 'Confirm your email first. We sent you a link.' });
    res.json({ token: createSession(user.id), user: publicUser(user) });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => { endSession(req.token); res.json({ ok: true }); });

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
