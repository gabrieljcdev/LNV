import express from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import {
  hashPassword, checkPassword, createSession, endSession, endAllSessions, publicUser,
  createVerifyToken, consumeVerifyToken, sendVerifyEmail, mailConfigured, frontendUrl,
  createResetToken, consumeResetToken, resetTokenState, sendResetEmail, isReservedUsername,
  USERNAME_RE, EMAIL_RE, PASSWORD_MIN, befriend,
} from '../services/authService.js';
import { logEvent } from '../services/logService.js';

// /api/auth — create account, confirm email, sign in / out, reset a
// forgotten password, who am I. Every outcome is written to the admin log.
const router = express.Router();

// Sign-in and sign-up attempts: 20 per 15 minutes per address.
const strict = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

// Without SMTP (local dev) the browser gets the link back so it can be
// clicked from the page. Never in production.
const devLink = (link, key = 'devVerifyUrl') => (!mailConfigured() && process.env.NODE_ENV !== 'production') ? { [key]: link } : {};

router.post('/register', strict, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!USERNAME_RE.test(username)) return res.status(400).json({ field: 'username', error: 'Usernames are 3–24 characters: letters, numbers, . _ or -.' });
    if (isReservedUsername(username)) return res.status(400).json({ field: 'username', error: 'That username is reserved. Pick another.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ field: 'email', error: "That doesn't look like an email address." });
    if (password.length < PASSWORD_MIN) return res.status(400).json({ field: 'password', error: `Passwords need at least ${PASSWORD_MIN} characters.` });
    if (db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(username)) return res.status(409).json({ field: 'username', error: 'That username is taken.' });
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) return res.status(409).json({ field: 'email', error: 'There is already an account with that email. Sign in instead.' });

    const id = db.prepare('INSERT INTO users (username, display_name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(username, username, email, hashPassword(password)).lastInsertRowid;
    befriend(id);
    logEvent('info', 'auth', `Account created: ${username}`, { req, user: { id, username }, detail: { email } });
    const link = createVerifyToken(id);
    await sendVerifyEmail({ username, email }, link);
    res.status(201).json({ ok: true, email, ...devLink(link) });
  } catch (err) { next(err); }
});

// The link in the email. Confirms, then sends the browser to the sign-in
// page with the outcome: ?verified=1, or ?verify=expired / invalid.
router.get('/verify', (req, res) => {
  const result = consumeVerifyToken(req.query.token);
  logEvent(result === 'ok' ? 'info' : 'warn', 'auth', result === 'ok' ? 'Email confirmed' : `Confirmation link ${result}`, { req });
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
    if (!user || !checkPassword(password, user.password_hash)) {
      logEvent('warn', 'auth', `Failed sign-in for "${login.slice(0, 60)}"`, { req, user: user ? { id: user.id, username: user.username } : null });
      return res.status(401).json({ error: "That username/email and password don't match." });
    }
    if (!user.email_verified_at) return res.status(403).json({ needsVerification: true, email: user.email, error: 'Confirm your email first. We sent you a link.' });
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    logEvent('info', 'auth', `Signed in${user.is_admin ? ' (admin)' : ''}`, { req, user });
    res.json({ token: createSession(user.id), user: publicUser(user) });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  if (req.user) logEvent('info', 'auth', 'Signed out', { req });
  endSession(req.token);
  res.json({ ok: true });
});

// ── Forgotten password ──
// Step 1: email a reset link. Same answer whether or not the address has an
// account, so it can't be used to find out who's signed up.
router.post('/forgot', strict, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ field: 'email', error: "That doesn't look like an email address." });
    const user = db.prepare('SELECT id, username, email FROM users WHERE lower(email) = ?').get(email);
    let extra = {};
    if (user) {
      const link = createResetToken(user.id);
      await sendResetEmail(user, link);
      logEvent('info', 'auth', 'Password reset requested', { req, user });
      extra = devLink(link, 'devResetUrl');
    } else {
      logEvent('info', 'auth', 'Password reset requested for an unknown email', { req, detail: { email } });
    }
    res.json({ ok: true, ...extra });
  } catch (err) { next(err); }
});

// The reset page asks first, so an expired link says so before any typing.
router.get('/reset/check', (req, res) => res.json({ state: resetTokenState(req.query.token) }));

// Step 2: the new password, with the token from the link. Single use; signs
// the account out everywhere; also confirms the email (the link proved it).
router.post('/reset', strict, (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < PASSWORD_MIN) return res.status(400).json({ field: 'password', error: `Passwords need at least ${PASSWORD_MIN} characters.` });
    const result = consumeResetToken(req.body.token);
    if (result.status !== 'ok') {
      logEvent('warn', 'auth', `Password reset link ${result.status}`, { req });
      return res.status(400).json({ error: result.status === 'expired' ? 'That reset link has expired. Ask for a new one.' : "That reset link isn't valid any more (it may already have been used)." });
    }
    db.prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?")
      .run(hashPassword(password), result.userId);
    endAllSessions(result.userId);
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(result.userId);
    logEvent('info', 'auth', 'Password changed by reset link (signed out everywhere)', { req, user });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
