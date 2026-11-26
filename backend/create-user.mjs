// Make an account that can sign in straight away (email marked confirmed), with a random password
// that is printed once. For people you are giving a login to by hand.
//   node create-user.mjs <username> [email]
// Run from backend/ (uses LNV_DB_PATH if set). They can change the password and add an email in the site.
import { randomBytes } from 'node:crypto';
import db from './db/database.js';
import { hashPassword, USERNAME_RE, EMAIL_RE } from './services/authService.js';

const [username, email] = process.argv.slice(2);
if (!username || !USERNAME_RE.test(username)) { console.error('Usage: node create-user.mjs <username> [email]  (3-24 letters, numbers, _ . -)'); process.exit(1); }
if (email && !EMAIL_RE.test(email)) { console.error('That email address looks wrong.'); process.exit(1); }
if (db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(username)) { console.error(`${username} already exists.`); process.exit(1); }
if (email && db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(email)) { console.error('That email is already used.'); process.exit(1); }

// 16 characters, no look-alikes (0/O, 1/l/I), easy to read out or type.
const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = [...randomBytes(16)].map(b => alphabet[b % alphabet.length]).join('');
db.prepare("INSERT INTO users (username, email, password_hash, email_verified_at) VALUES (?, ?, ?, datetime('now'))")
  .run(username, email ? email.trim().toLowerCase() : null, hashPassword(password));
console.log(`created ${username}${email ? ' <' + email + '>' : ' (no email)'}`);
console.log(`password: ${password}`);
