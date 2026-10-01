import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import db from '../db/database.js';

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
]) { try { db.exec(sql); } catch { /* already applied */ } }

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
  const row = db.prepare(`SELECT u.id, u.username, u.display_name, u.email, u.email_verified_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), new Date().toISOString());
  return row || null;
}
export const isAdminUser = u => u?.username === 'lnv_admin';
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

export async function sendVerifyEmail(user, link) {
  if (!mailConfigured()) {
    console.log(`\n✉️  [no SMTP configured] Confirmation link for ${user.username} <${user.email}>:\n   ${link}\n`);
    return { sent: false };
  }
  await mailer().sendMail({
    from: process.env.MAIL_FROM || 'Late Night Vibes <no-reply@latenightvibes.com>',
    to: user.email,
    subject: 'Confirm your Late Night Vibes account',
    text: `Hi ${user.username},\n\nConfirm your email to finish setting up your Late Night Vibes account:\n${link}\n\nThe link works for ${VERIFY_HOURS} hours. If you didn't sign up, ignore this email.\n`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1b19">
      <p>Hi ${escapeHtml(user.username)},</p>
      <p>Confirm your email to finish setting up your Late Night Vibes account.</p>
      <p><a href="${link}" style="display:inline-block;background:#2C4A2E;color:#fff;padding:10px 18px;border-radius:99px;text-decoration:none">Confirm my email</a></p>
      <p style="color:#6b665e;font-size:13px">The link works for ${VERIFY_HOURS} hours. If you didn't sign up, ignore this email.</p></div>`,
  });
  return { sent: true };
}
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
