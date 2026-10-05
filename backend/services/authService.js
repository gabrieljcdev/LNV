import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import db from '../db/database.js';
import { logEvent } from './logService.js';

// ── Accounts (2026-10-01) ─────────────────────────────────────────────────────
// Username + email + password, email confirmed by a link before you can sign
// in. Passwords: scrypt (Node's built-in), salted per user. Sessions: a
// random token the browser sends as `Authorization: Bearer …`; only its
// SHA-256 is stored, so a leaked database can't be used to sign in.
//
// Email: set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM in
// backend/.env to send real mail. Without them (local dev) the confirmation
// link is printed to the backend console instead, and returned to the
// browser so the sign-up page can show it.

const SESSION_DAYS = 30;
const VERIFY_HOURS = 24;
const RESET_HOURS = 1;
// Read when used: server.js loads .env after its imports have run.
export const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';
const apiUrl = () => process.env.API_URL || `http://localhost:${process.env.PORT || 3001}/api`;

for (const sql of [
  'ALTER TABLE users ADD COLUMN email TEXT',
  'ALTER TABLE users ADD COLUMN password_hash TEXT',
  'ALTER TABLE users ADD COLUMN email_verified_at TEXT',
  'CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email)) WHERE email IS NOT NULL',
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  // Admin is a flag on the account (2026-10-02), not a username: before,
  // whoever registered "lnv_admin" first after a purge would be admin.
  // Grant/revoke with `node admin.mjs grant|revoke <username>`.
  'ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_login_at TEXT',
]) { try { db.exec(sql); } catch { /* already applied */ } }
// The existing admin account keeps admin under the new rule.
try { db.prepare("UPDATE users SET is_admin = 1 WHERE username = 'lnv_admin' AND is_admin = 0").run(); } catch { /* ignore */ }

// First friend (2026-10-04): like Tom on MySpace, every account starts out
// following the site's first admin, so no one's feed starts empty. It's an
// ordinary follow: unfollowing sticks. `befriended_at` marks accounts that
// already got theirs, so existing accounts are caught up once, never again.
try { db.exec('ALTER TABLE users ADD COLUMN befriended_at TEXT'); } catch { /* already applied */ }
export function firstFriend() {
  return db.prepare('SELECT id, username FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get() || null;
}
export function befriend(userId) {
  const friend = firstFriend();
  if (!friend) return; // no admin yet: caught up once there is one
  if (friend.id !== userId) db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)').run(userId, friend.id);
  db.prepare("UPDATE users SET befriended_at = datetime('now') WHERE id = ?").run(userId);
}
try { for (const { id } of db.prepare('SELECT id FROM users WHERE befriended_at IS NULL').all()) befriend(id); } catch { /* ignore */ }

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const isoIn = ms => new Date(Date.now() + ms).toISOString();

// ── passwords ──
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export function checkPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(keyHex, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(key, want);
}

// ── validation ──
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
// Names nobody can register: they'd read as staff or the site itself.
const RESERVED = /^(admin|administrator|root|lnv|lnv_admin|lnvadmin|support|help|moderator|mod|staff|system|official|latenightvibes|no-?reply)$/i;
export const isReservedUsername = name => RESERVED.test(String(name || '').trim());
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;

// ── sessions ──
export function createSession(userId) {
  const token = newToken();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, isoIn(SESSION_DAYS * 864e5));
  return token;
}
export function endSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}
export function userForToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.username, u.display_name, u.email, u.email_verified_at, u.is_admin
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), new Date().toISOString());
  return row || null;
}
export const isAdminUser = u => !!u?.is_admin;
// Sign out everywhere (after a password reset).
export function endAllSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
export const publicUser = u => u && { id: u.id, username: u.username, email: u.email, admin: isAdminUser(u) };

// ── email confirmation ──
export function createVerifyToken(userId) {
  db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'verify'").run(userId);
  const token = newToken();
  db.prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'verify', ?)").run(sha256(token), userId, isoIn(VERIFY_HOURS * 36e5));
  return `${apiUrl()}/auth/verify?token=${token}`;
}
// → 'ok' | 'expired' | 'invalid'
export function consumeVerifyToken(token) {
  const row = db.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = 'verify'").get(sha256(String(token || '')));
  if (!row) return 'invalid';
  db.prepare('DELETE FROM email_tokens WHERE token_hash = ?').run(row.token_hash);
  if (row.expires_at <= new Date().toISOString()) return 'expired';
  db.prepare("UPDATE users SET email_verified_at = datetime('now') WHERE id = ?").run(row.user_id);
  return 'ok';
}

// ── password reset ──
// The link goes to the frontend's sign-in page (?reset=<token>), which asks
// for the new password and posts it with the token.
export function createResetToken(userId) {
  db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'reset'").run(userId);
  const token = newToken();
  db.prepare("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'reset', ?)").run(sha256(token), userId, isoIn(RESET_HOURS * 36e5));
  return `${frontendUrl()}/login?reset=${token}`;
}
// → { status: 'ok', userId } | { status: 'expired' | 'invalid' }. Single use.
export function consumeResetToken(token) {
  const row = db.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = 'reset'").get(sha256(String(token || '')));
  if (!row) return { status: 'invalid' };
  db.prepare('DELETE FROM email_tokens WHERE token_hash = ?').run(row.token_hash);
  if (row.expires_at <= new Date().toISOString()) return { status: 'expired' };
  return { status: 'ok', userId: row.user_id };
}
// Is a reset link still usable? (The reset page checks before showing the form.)
export function resetTokenState(token) {
  const row = db.prepare("SELECT expires_at FROM email_tokens WHERE token_hash = ? AND purpose = 'reset'").get(sha256(String(token || '')));
  if (!row) return 'invalid';
  return row.expires_at <= new Date().toISOString() ? 'expired' : 'ok';
}

let transport = null;
export const mailConfigured = () => !!process.env.SMTP_HOST;
function mailer() {
  if (!transport) transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

const mailFrom = () => process.env.MAIL_FROM || 'Late Night Vibes <no-reply@latenightvibes.com>';

// One email: a line of text, a button, and a quiet footnote. Without SMTP
// (local dev) it's printed to the backend console instead. Every send and
// every failure lands in the admin log.
async function sendMail({ to, subject, intro, button, link, footnote, logAs }) {
  if (!mailConfigured()) {
    console.log(`\n✉️  [no SMTP configured] ${subject} — ${to}:\n   ${link}\n`);
    logEvent('info', 'mail', `Not sent (no SMTP configured): ${subject}`, { detail: { to, logAs } });
    return { sent: false };
  }
  try {
    await mailer().sendMail({
      from: mailFrom(),
      to,
      subject,
      text: `${intro}\n\n${link}\n\n${footnote}\n`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1b19">
        <p>${intro.split('\n\n').map(escapeHtml).join('</p><p>')}</p>
        <p><a href="${link}" style="display:inline-block;background:#2C4A2E;color:#fff;padding:10px 18px;border-radius:99px;text-decoration:none">${escapeHtml(button)}</a></p>
        <p style="color:#6b665e;font-size:13px">${escapeHtml(footnote)}</p></div>`,
    });
    logEvent('info', 'mail', `Sent: ${subject}`, { detail: { to, logAs } });
    return { sent: true };
  } catch (err) {
    logEvent('error', 'mail', `Failed to send: ${subject} — ${err.message}`, { detail: { to, logAs, code: err.code, response: err.response } });
    throw new Error("We couldn't send the email just now. Try again in a minute.");
  }
}

export function sendVerifyEmail(user, link) {
  return sendMail({
    to: user.email, subject: 'Confirm your Late Night Vibes account', logAs: 'verify',
    intro: `Hi ${user.username},\n\nConfirm your email to finish setting up your Late Night Vibes account.`,
    button: 'Confirm my email', link,
    footnote: `The link works for ${VERIFY_HOURS} hours. If you didn't sign up, ignore this email.`,
  });
}

export function sendResetEmail(user, link) {
  return sendMail({
    to: user.email, subject: 'Reset your Late Night Vibes password', logAs: 'reset',
    intro: `Hi ${user.username},\n\nSomeone asked to reset the password for your Late Night Vibes account. If it was you, choose a new one here.`,
    button: 'Choose a new password', link,
    footnote: `The link works for ${RESET_HOURS} hour and only once. If you didn't ask for this, ignore this email — your password stays the same.`,
  });
}

// Admin "send a test email" (Status tab).
export function sendTestEmail(to) {
  return sendMail({
    to, subject: 'Late Night Vibes test email', logAs: 'test',
    intro: 'This is a test from the Late Night Vibes admin page. If you can read it, email sending works.',
    button: 'Open Late Night Vibes', link: frontendUrl(),
    footnote: `Sent from ${mailFrom()}.`,
  });
}
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
