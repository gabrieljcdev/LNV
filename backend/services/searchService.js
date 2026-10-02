import db from '../db/database.js';

// ── Site search (2026-10-01) ───────────────────────────────────────────────────
// One SQLite FTS5 index over every post: artist, record title, post title,
// label, catalogue number, genres, track titles, description, channel, year.
//
// trigram tokenizer: any 3+ character fragment matches inside words ("kayt"
// finds Kaytranada, "34173" finds PC 34173). remove_diacritics: "salongo"
// finds Sălongo. Results are ranked with bm25, weighted so a match in the
// artist or title beats one buried in a description.
//
// Keeping it current: triggers on posts and its child tables write the
// post's id into search_dirty on any insert / update / delete, from any code
// path (routes, enrichers, backfill scripts). Each search first re-indexes
// whatever is dirty, so the index is never stale and nothing else has to
// remember to update it.

const COLUMNS = ['artist', 'title', 'post_title', 'label', 'catno', 'genres', 'tracks', 'channel', 'year', 'notes'];
// bm25 weights, same order as COLUMNS.
const WEIGHTS = [10, 8, 6, 5, 5, 4, 3, 4, 2, 1];

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
    ${COLUMNS.join(', ')},
    tokenize = 'trigram remove_diacritics 1'
  );
  CREATE TABLE IF NOT EXISTS search_dirty (post_id INTEGER PRIMARY KEY);
`);

const CHILD_TABLES = ['post_artists', 'post_labels', 'post_genres', 'post_tracks'];
for (const [name, table, key] of [
  ['posts', 'posts', 'id'],
  ...CHILD_TABLES.map(t => [t, t, 'post_id']),
]) {
  for (const ev of ['INSERT', 'UPDATE', 'DELETE']) {
    const row = ev === 'DELETE' ? 'OLD' : 'NEW';
    db.exec(`CREATE TRIGGER IF NOT EXISTS search_dirty_${name}_${ev.toLowerCase()} AFTER ${ev} ON ${table}
      BEGIN INSERT OR IGNORE INTO search_dirty (post_id) VALUES (${row}.${key}); END;`);
  }
}

const getPost = db.prepare('SELECT id, title, post_title, notes, channel, year, is_spotlight FROM posts WHERE id = ?');
const getArtists = db.prepare('SELECT artist_name FROM post_artists WHERE post_id = ?');
const getLabels = db.prepare('SELECT label_name, catalogue_number FROM post_labels WHERE post_id = ?');
const getGenres = db.prepare('SELECT genre FROM post_genres WHERE post_id = ?');
const getTracks = db.prepare('SELECT title FROM post_tracks WHERE post_id = ?');
const delRow = db.prepare('DELETE FROM posts_fts WHERE rowid = ?');
const insRow = db.prepare(`INSERT INTO posts_fts (rowid, ${COLUMNS.join(', ')}) VALUES (?, ${COLUMNS.map(() => '?').join(', ')})`);

function indexPost(id) {
  delRow.run(id);
  const p = getPost.get(id);
  if (!p || p.is_spotlight) return;
  const labels = getLabels.all(id);
  insRow.run(
    id,
    getArtists.all(id).map(r => r.artist_name).join(' · '),
    p.title || '',
    p.post_title || '',
    labels.map(r => r.label_name).join(' · '),
    labels.map(r => r.catalogue_number).filter(Boolean).join(' · '),
    getGenres.all(id).map(r => r.genre).join(' · '),
    getTracks.all(id).map(r => r.title).join(' · '),
    p.channel || '',
    p.year ? String(p.year) : '',
    p.notes || '',
  );
}

const flushDirty = db.transaction(() => {
  const ids = db.prepare('SELECT post_id FROM search_dirty').all().map(r => r.post_id);
  for (const id of ids) indexPost(id);
  db.prepare('DELETE FROM search_dirty').run();
});

// First run (or after the table was dropped): index everything.
if (db.prepare('SELECT COUNT(*) c FROM posts_fts').get().c === 0) {
  db.exec('INSERT OR IGNORE INTO search_dirty (post_id) SELECT id FROM posts');
}
flushDirty();

// "#54", "54", "no. 54" → 54. A bare number is a post number only when it
// isn't plausibly a year (a 4-digit number from 1900 on is searched as text
// too — see search()).
export function parsePostNumber(q) {
  const m = String(q || '').trim().match(/^(?:#|no\.?\s*)?(\d{1,6})$/i);
  return m ? Number(m[1]) : null;
}

// FTS5 query for the trigram index: every word of 3+ characters must match
// (quoted, so punctuation in the query can't break the syntax). Shorter
// words can't be matched by trigrams; they're dropped, and a query made
// only of short words returns null (caller falls back to LIKE).
function ftsQuery(q) {
  const words = String(q).trim().split(/\s+/).filter(w => [...w].length >= 3);
  if (!words.length) return null;
  return words.map(w => '"' + w.replace(/"/g, '""') + '"').join(' AND ');
}

const strip = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Ranked post ids for a free-text query.
export function searchPostIds(q, { limit = 60, offset = 0 } = {}) {
  flushDirty();
  const match = ftsQuery(q);
  if (match) {
    return db.prepare(`
      SELECT rowid AS id FROM posts_fts WHERE posts_fts MATCH ?
      ORDER BY bm25(posts_fts, ${WEIGHTS.join(', ')}) LIMIT ? OFFSET ?
    `).all(match, Number(limit), Number(offset)).map(r => r.id);
  }
  // 1–2 character queries: plain substring on the short, important fields.
  const like = '%' + q.trim() + '%';
  return db.prepare(`
    SELECT rowid AS id FROM posts_fts
    WHERE artist LIKE ? OR title LIKE ? OR post_title LIKE ? OR label LIKE ? OR genres LIKE ?
    ORDER BY rowid DESC LIMIT ? OFFSET ?
  `).all(like, like, like, like, like, Number(limit), Number(offset)).map(r => r.id);
}

// Names (artists / labels / genres) containing the query, accent- and
// case-insensitive, most-posted first.
function names(sql, q, limit) {
  const needle = strip(q.trim());
  if (!needle) return [];
  return db.prepare(sql).all()
    .filter(r => strip(r.name).includes(needle))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Everything the search box's dropdown shows, in one call.
export function suggest(q, { posts: postLimit = 6, names: nameLimit = 4 } = {}) {
  q = String(q || '').trim();
  const out = { goto: null, posts: [], artists: [], labels: [], genres: [] };
  if (!q) return out;

  const num = parsePostNumber(q);
  if (num != null) {
    const p = db.prepare('SELECT id FROM posts WHERE id = ? AND is_spotlight = 0').get(num);
    // A number past any plausible post (a year, a cat no.) isn't offered as
    // a missing page.
    out.goto = p ? summary(p.id) : (num < 1000 ? { id: num, missing: true } : null);
  }
  // A bare post number only searches text too when it could be a year or a
  // catalogue number fragment (3+ digits).
  if (num == null || String(num).length >= 3) {
    out.posts = searchPostIds(q, { limit: postLimit + 1 })
      .filter(id => id !== out.goto?.id).slice(0, postLimit).map(summary).filter(Boolean);
  }
  if (num == null) {
    out.artists = names(`SELECT artist_name AS name, COUNT(DISTINCT post_id) AS count FROM post_artists GROUP BY artist_name`, q, nameLimit)
      .filter(r => !/^various( artists)?$/i.test(r.name));
    out.labels = names(`SELECT label_name AS name, COUNT(DISTINCT post_id) AS count FROM post_labels GROUP BY label_name`, q, nameLimit);
    out.genres = names(`SELECT genre AS name, COUNT(DISTINCT post_id) AS count FROM post_genres GROUP BY genre`, q, nameLimit);
  }
  return out;
}

function summary(id) {
  const p = db.prepare('SELECT id, title, post_title, year, cover_image, thumb_image, post_type FROM posts WHERE id = ?').get(id);
  if (!p) return null;
  const artist = db.prepare('SELECT artist_name FROM post_artists WHERE post_id = ? LIMIT 1').get(id)?.artist_name || '';
  const label = db.prepare('SELECT label_name FROM post_labels WHERE post_id = ? LIMIT 1').get(id)?.label_name || '';
  return { id: p.id, artist, title: p.title, post_title: p.post_title, year: p.year, label, cover: p.thumb_image || p.cover_image || null, post_type: p.post_type };
}
