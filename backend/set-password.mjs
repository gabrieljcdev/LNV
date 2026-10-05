// Give an existing account (made before passwords existed) a password and
// email, marked as confirmed, so its owner can sign in.
//   node set-password.mjs <username> <email> <password>
// Run from backend/. Existing posts stay attached to the account.
import db from './db/database.js';
import { hashPassword, EMAIL_RE, PASSWORD_MIN } from './services/authService.js';

const [username, email, password] = process.argv.slice(2);
if (!username || !email || !password) { console.error('Usage: node set-password.mjs <username> <email> <password>'); process.exit(1); }
if (!EMAIL_RE.test(email)) { console.error('That email address looks wrong.'); process.exit(1); }
if (password.length < PASSWORD_MIN) { console.error(`Passwords need at least ${PASSWORD_MIN} characters.`); process.exit(1); }
const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (!user) { console.error(`No user called ${username}.`); process.exit(1); }
db.prepare("UPDATE users SET email = ?, password_hash = ?, email_verified_at = datetime('now') WHERE id = ?")
  .run(email.trim().toLowerCase(), hashPassword(password), user.id);
console.log(`${username} can now sign in.`);
