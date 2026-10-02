// Grant or remove admin rights, or list the admins (2026-10-02). Admin is a
// flag on the account now, not a username, so after the pre-release purge
// whoever you grant here is admin — nobody gets it by picking a name.
//   node admin.mjs grant <username>
//   node admin.mjs revoke <username>
//   node admin.mjs list
// Run from backend/.
import db from './db/database.js';
import './services/authService.js'; // makes sure the is_admin column exists

const [cmd, username] = process.argv.slice(2);
const find = name => db.prepare('SELECT id, username, email, email_verified_at, is_admin FROM users WHERE lower(username) = lower(?)').get(name);

if (cmd === 'list') {
  const admins = db.prepare('SELECT username, email FROM users WHERE is_admin = 1 ORDER BY username').all();
  console.log(admins.length ? admins.map(a => `${a.username} <${a.email || 'no email'}>`).join('\n') : 'No admins.');
} else if (cmd === 'grant' || cmd === 'revoke') {
  if (!username) { console.error(`Usage: node admin.mjs ${cmd} <username>`); process.exit(1); }
  const user = find(username);
  if (!user) { console.error(`No user called ${username}.`); process.exit(1); }
  if (cmd === 'revoke' && user.is_admin && db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1').get().c <= 1) {
    console.error(`${user.username} is the only admin — grant someone else first.`); process.exit(1);
  }
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(cmd === 'grant' ? 1 : 0, user.id);
  console.log(`${user.username} is ${cmd === 'grant' ? 'now an admin' : 'no longer an admin'}.${cmd === 'grant' && !user.email_verified_at ? ' (Their email is not confirmed yet, so they cannot sign in until it is.)' : ''}`);
} else {
  console.error('Usage: node admin.mjs grant <username> | revoke <username> | list');
  process.exit(1);
}
