// Launch purge (2026-10-09): remove every post and what hangs off it, and keep everything we collected —
// the Discogs catalogue and caches, YouTube/Spotify/Last.fm caches, saved track links, crawled channels,
// profile links, names, and the users and their Discogs lists.
//   node purge-posts.mjs          shows what it would delete (changes nothing)
//   node purge-posts.mjs --yes    deletes it
// Run from backend/ (uses LNV_DB_PATH if set). Take a backup first: deploy/backup.sh.
import db from './db/database.js';

const apply = process.argv.includes('--yes');
if (process.argv.includes('--reset-numbers')) {
  if (db.prepare('SELECT COUNT(*) c FROM posts').get().c) { console.error('Posts still exist — purge them first.'); process.exit(1); }
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('posts', 'post_tracks', 'post_artists', 'post_labels', 'post_genres', 'comments')").run();
  console.log('Post numbers restart at #1.'); process.exit(0);
}
const has = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const count = sql => db.prepare(sql).get().c;

// [what, table, where] in the order they must go (children before posts).
const steps = [
  ['track sources of post tracks', 'track_sources', 'track_id IN (SELECT id FROM post_tracks)'],
  ['post tracks', 'post_tracks', '1'],
  ['post artists', 'post_artists', '1'],
  ['post labels', 'post_labels', '1'],
  ['post genres', 'post_genres', '1'],
  ['comments', 'comments', '1'],
  ['spotlights', 'spotlights', '1'],
  ['shared-feed items', 'shared_feed_items', '1'],
  ['"also" joins', 'post_joins', '1'],
  ['reports', 'reports', '1'],
  ['playlist tracks that came from posts', 'playlist_tracks', 'post_id IS NOT NULL'],
  ['posts', 'posts', '1'],
].filter(([, t]) => has(t));

for (const [what, table, where] of steps) console.log(`${apply ? 'deleting' : 'would delete'} ${String(count(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`)).padStart(6)}  ${what}`);

if (!apply) { console.log('\nNothing changed. Run again with --yes to delete.'); process.exit(0); }
db.transaction(() => { for (const [, table, where] of steps) db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(); })();
// The search index follows by itself (the delete triggers mark each post dirty; it re-indexes on the next start).
db.pragma('wal_checkpoint(TRUNCATE)');
console.log('\nDone. Post numbers carry on from the last one used; to restart at #1 run:  node purge-posts.mjs --reset-numbers');
