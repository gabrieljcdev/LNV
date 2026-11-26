import db from '../db/database.js';
import { searchDiscogs, getRelease } from './discogsService.js';

// Track artists and remixers (2026-10-10): the names on a record's tracks ("Dixon" from "(Dixon Rework)") never had a
// Discogs id saved, so their drawer said "isn't linked to Discogs yet". A name gets its id here: from the crawl's
// known names, else one Discogs artist search that must come back with exactly one artist of that exact name.
// Every answer is kept — including "no match" and "several match" — so a name is not searched twice (a "none" is
// tried again after RETRY_DAYS). backend/sweep-artist-ids.mjs runs this over every post that is already up.
db.exec(`CREATE TABLE IF NOT EXISTS artist_name_lookup (
  name_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  discogs_id INTEGER,
  status TEXT NOT NULL,            -- 'ok' | 'none' | 'ambiguous'
  checked_at TEXT DEFAULT (datetime('now'))
)`);

const RETRY_DAYS = 30;
// "Bloom (5)" (a Discogs disambiguation suffix) is the same name as "Bloom".
export const nameKey = n => String(n || '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** name -> Discogs id for every name already resolved, for the post summaries. */
export function resolvedArtistIds() {
  const m = new Map();
  for (const r of db.prepare("SELECT name_key, discogs_id FROM artist_name_lookup WHERE status = 'ok' AND discogs_id IS NOT NULL").all()) m.set(r.name_key, r.discogs_id);
  return m;
}

const save = (key, name, id, status) => db.prepare(`INSERT INTO artist_name_lookup (name_key, name, discogs_id, status, checked_at) VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(name_key) DO UPDATE SET name = excluded.name, discogs_id = excluded.discogs_id, status = excluded.status, checked_at = datetime('now')`).run(key, name, id, status);

/** Keep a name -> id that is known for certain (it came from a Discogs release's own credits). */
export function learnArtist(name, id) {
  const key = nameKey(name);
  if (key && Number(id) > 0 && Number(id) !== 194 && !/^various( artists)?$/.test(key)) save(key, String(name).trim(), Number(id), 'ok');
}

/**
 * Learn every credited name on a release — the release's artists, each track's artists and each track's remixers,
 * all of which Discogs gives with their ids. This is the accurate source: no guessing from a title. Returns how many
 * names it learned. (The release is cached, so a post that was just composed costs nothing.)
 */
export async function learnFromRelease(discogsId) {
  const rel = await getRelease(Number(discogsId), { background: true });
  let n = 0;
  const take = list => (list || []).forEach(a => { if (a?.id && a?.name) { learnArtist(a.name, a.id); n++; } });
  take(rel.artists); take(rel.remixers);
  for (const t of rel.tracklist || []) { take(t.artists); take(t.remixers); }
  return n;
}

/** The Discogs artist id for a name, or null. `search: false` only reads what is already known (no Discogs call). */
export async function resolveArtistName(rawName, { search = true } = {}) {
  const name = String(rawName || '').trim();
  const key = nameKey(name);
  if (!key || /^various( artists)?$/.test(key)) return { id: null, status: 'none' };
  const hit = db.prepare('SELECT discogs_id, status, checked_at FROM artist_name_lookup WHERE name_key = ?').get(key);
  if (hit && (hit.status === 'ok' || Date.now() - new Date(hit.checked_at.replace(' ', 'T') + 'Z') < RETRY_DAYS * 86400000)) return { id: hit.discogs_id, status: hit.status };
  const known = db.prepare("SELECT entity_id FROM discogs_names WHERE kind = 'artist' AND lower(name) = ?").all(key);
  if (known.length === 1) { save(key, name, known[0].entity_id, 'ok'); return { id: known[0].entity_id, status: 'ok' }; }
  if (known.length > 1) { save(key, name, null, 'ambiguous'); return { id: null, status: 'ambiguous' }; }
  if (!search) return { id: null, status: 'unknown' };
  const found = ((await searchDiscogs(name, 'artist')).results || []).filter(r => nameKey(r.title) === key);
  if (found.length === 1) { save(key, name, Number(found[0].id), 'ok'); return { id: Number(found[0].id), status: 'ok' }; }
  const status = found.length > 1 ? 'ambiguous' : 'none';
  save(key, name, null, status);
  return { id: null, status };
}
