// Give an existing account a new random password (printed once) and sign it out everywhere.
//   node reset-password.mjs <username>
// Run from backend/ (uses LNV_DB_PATH if set).
import { randomBytes } from 'node:crypto';
import db from './db/database.js';
import { hashPassword } from './services/authService.js';

const [username] = process.argv.slice(2);
const user = username && db.prepare('SELECT id, username FROM users WHERE lower(username) = lower(?)').get(username);
if (!user) { console.error('Usage: node reset-password.mjs <existing username>'); process.exit(1); }
const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = [...randomBytes(16)].map(b => alphabet[b % alphabet.length]).join('');
db.prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?").run(hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
console.log(`new password for ${user.username}: ${password}`);
