// Launch purge, part 2 (2026-10-09): delete every account except the ones named, and everything they own
// (sessions, playlists and their tracks, follows, favourites, Discogs links, walls, shared feeds, votes…).
// Posts are purged separately (purge-posts.mjs). The catalogue, caches and saved links are not touched.
//   node purge-users.mjs lnv_admin          shows what it would delete (changes nothing)
//   node purge-users.mjs lnv_admin --yes    deletes it
// Run from backend/ (uses LNV_DB_PATH if set). Take a backup first: deploy/backup.sh.
import db from './db/database.js';

const apply = process.argv.includes('--yes');
const keepNames = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!keepNames.length) { console.error('Name at least one account to keep.'); process.exit(1); }
const keep = keepNames.map(n => db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(n)?.id);
if (keep.some(k => !k)) { console.error('No such user among: ' + keepNames.join(', ')); process.exit(1); }
const K = keep.join(',');
const has = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);

// Playlists / shared feeds first (their children are keyed by the parent id), then everything keyed by a user.
const steps = [
  ['playlist tracks', 'playlist_tracks', `playlist_id IN (SELECT id FROM playlists WHERE owner_id NOT IN (${K}))`],
  ['playlist releases', 'playlist_releases', `playlist_id IN (SELECT id FROM playlists WHERE owner_id NOT IN (${K}))`],
  ['playlist members (of those lists)', 'playlist_members', `playlist_id IN (SELECT id FROM playlists WHERE owner_id NOT IN (${K}))`],
  ['playlists', 'playlists', `owner_id NOT IN (${K})`],
  ['shared-feed items', 'shared_feed_items', `feed_id IN (SELECT id FROM shared_feeds WHERE owner_id NOT IN (${K}))`],
  ['shared-feed members (of those feeds)', 'shared_feed_members', `feed_id IN (SELECT id FROM shared_feeds WHERE owner_id NOT IN (${K}))`],
  ['shared feeds', 'shared_feeds', `owner_id NOT IN (${K})`],
  ['playlist memberships', 'playlist_members', `user_id NOT IN (${K})`],
  ['shared-feed memberships', 'shared_feed_members', `user_id NOT IN (${K})`],
  ['follows', 'follows', `follower_id NOT IN (${K}) OR followee_id NOT IN (${K})`],
  ['Discogs links', 'discogs_links', `user_id NOT IN (${K})`],
  ['favourite names', 'favourite_names', `user_id NOT IN (${K})`],
  ['intro dismissals', 'intro_dismissals', `user_id NOT IN (${K})`],
  ['profile pins', 'profile_pins', `user_id NOT IN (${K})`],
  ['wall writers', 'wall_writers', `user_id NOT IN (${K})`],
  ['walls', 'walls', `user_id NOT IN (${K})`],
  ['link submissions', 'track_link_submissions', `user_id NOT IN (${K})`],
  ['link votes', 'track_link_votes', `user_id NOT IN (${K})`],
  ['"also" joins', 'post_joins', `user_id NOT IN (${K})`],
  ['comments', 'comments', `user_id NOT IN (${K})`],
  ['reports filed', 'reports', `reporter_user_id IS NOT NULL AND reporter_user_id NOT IN (${K})`],
  ['sessions', 'sessions', `user_id NOT IN (${K})`],
  ['email tokens', 'email_tokens', `user_id NOT IN (${K})`],
  ['users', 'users', `id NOT IN (${K})`],
].filter(([, t]) => has(t));

const count = (t, w) => db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE ${w}`).get().c;
console.log('keeping:', keepNames.join(', '));
for (const [what, t, w] of steps) console.log(`${apply ? 'deleting' : 'would delete'} ${String(count(t, w)).padStart(5)}  ${what}`);
const mine = db.prepare(`SELECT kind, COUNT(*) c FROM playlists WHERE owner_id IN (${K}) GROUP BY kind`).all();
if (!apply) { console.log('\nPlaylists that stay:', mine.map(m => `${m.c} ${m.kind}`).join(', ') || 'none'); console.log('Nothing changed. Run again with --yes to delete.'); process.exit(0); }
db.transaction(() => { for (const [, t, w] of steps) db.prepare(`DELETE FROM ${t} WHERE ${w}`).run(); })();
db.pragma('wal_checkpoint(TRUNCATE)');
console.log('\nDone.');
