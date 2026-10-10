// One-off / re-runnable: find the Discogs artist behind every track artist and remixer on posts that are already up
// (see services/artistLookup.js). Main artists and labels already carry their ids; this covers the names read from
// track titles / credits ("Dixon" from "(Dixon Rework)"), which never had one.
//
//   node sweep-artist-ids.mjs                   # DRY RUN: counts what it would do, writes nothing
//   node sweep-artist-ids.mjs --apply           # step 1: read every post's Discogs release and keep the ids of the
//                                               #   track artists and remixers it credits (exact, no guessing)
//   node sweep-artist-ids.mjs --apply --search  # step 2 (LOOSE, off by default): one Discogs artist search per name still
//                                               #   without an id. A version label like "(Hard House Mix)" can match an
//                                               #   unrelated artist, so check the list it prints before relying on it.
//
// Safe to re-run: names already answered are skipped (a "none" is retried after 30 days). Run it on the server
// (`sudo -u lnv LNV_DB_PATH=/var/lib/lnv/vinyl_crate.db node sweep-artist-ids.mjs --apply`), never on the PC.
import db from './db/database.js';
import { resolveArtistName, learnFromRelease, nameKey } from './services/artistLookup.js';
import { trackArtistNames } from './services/trackArtistNames.js';

const APPLY = process.argv.includes('--apply');
const SEARCH = process.argv.includes('--search');
// Step 1: the releases themselves (exact credits with ids).
const releases = db.prepare('SELECT DISTINCT discogs_id FROM posts WHERE discogs_id IS NOT NULL AND is_spotlight = 0').all().map(r => r.discogs_id);
if (!APPLY) console.log(`${releases.length} posts carry a Discogs release (dry run: --apply would read each one)`);
else {
  let learned = 0;
  for (const id of releases) {
    try { learned += await learnFromRelease(id); } catch (e) { console.log(`release ${id}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 700));
  }
  console.log(`step 1: read ${releases.length} releases, ${learned} credited names kept`);
}
const names = new Map(); // key -> display name
for (const t of db.prepare('SELECT title, artist FROM post_tracks').all()) {
  for (const n of trackArtistNames(t)) if (!names.has(nameKey(n))) names.set(nameKey(n), n);
}
for (const r of db.prepare("SELECT artist_name FROM post_artists WHERE discogs_artist_id IS NULL AND artist_name IS NOT NULL").all()) {
  if (!names.has(nameKey(r.artist_name))) names.set(nameKey(r.artist_name), r.artist_name);
}
const todo = [...names.values()].filter(n => {
  const hit = db.prepare('SELECT status FROM artist_name_lookup WHERE name_key = ?').get(nameKey(n));
  return !hit || hit.status !== 'ok';
});
console.log(`${names.size} names on posts, ${todo.length} still without an id`);
if (!APPLY || !SEARCH) { console.log(todo.length ? 'names still without an id (add --search to look them up):\n' + todo.join('\n') : 'every name has an answer'); process.exit(0); }
const tally = { ok: 0, none: 0, ambiguous: 0, unknown: 0 };
for (const n of todo) {
  try {
    const r = await resolveArtistName(n);
    tally[r.status] = (tally[r.status] || 0) + 1;
    console.log(`${r.status.padEnd(9)} ${n}${r.id ? '  -> ' + r.id : ''}`);
  } catch (e) { console.log(`error     ${n}: ${e.message}`); }
  await new Promise(r => setTimeout(r, 1000));
}
console.log(tally);
