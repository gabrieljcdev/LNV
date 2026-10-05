// One-off: backfill post_artists.discogs_artist_id and
// post_labels.discogs_label_id on posts that predate the id-persistence fix
// (2026-08-26). Every row in both tables was NULL, because ComposeModal
// stripped artist ids on every keystroke and never carried a label id at all
// -- which is what left the spotlight discography feature with nothing to
// resolve (see claude/2026-08-25-search-todo.md).
//
// New posts get their ids at compose time now. This is only for the ones
// already in the database.
//
// Two sources, in order of confidence:
//   1. posts.discogs_id is set  -> read that exact release and match its
//      artists/labels to the stored rows by normalised name.
//   2. no discogs_id, but a stream_url -> re-resolve the URL through
//      /api/media/resolve, which now does the Discogs reverse-lookup and
//      returns artists as [{ id, name }] plus a label_id. If that lands on a
//      release, its discogs_id is written back to the post too.
//
// Run with the backend already up (`npm run dev` / `node server.js` in
// another terminal), from backend/:
//
//   node backfill-discogs-ids.mjs          # DRY RUN -- prints, writes nothing
//   node backfill-discogs-ids.mjs --apply  # actually writes
//
// Safe to re-run: only touches rows where the id is still NULL.

import db from './db/database.js';

const API = 'http://localhost:3001/api';
const APPLY = process.argv.includes('--apply');

const norm = n => (n || '')
  .toLowerCase()
  .replace(/\s*\(\d+\)$/, '')      // Discogs disambiguation suffix: "Bloom (5)"
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Posts that still have at least one NULL id on either side.
const posts = db.prepare(`
  SELECT DISTINCT p.id, p.title, p.discogs_id, p.stream_url
  FROM posts p
  LEFT JOIN post_artists pa ON pa.post_id = p.id
  LEFT JOIN post_labels  pl ON pl.post_id = p.id
  WHERE (pa.id IS NOT NULL AND pa.discogs_artist_id IS NULL)
     OR (pl.id IS NOT NULL AND pl.discogs_label_id  IS NULL)
  ORDER BY p.id
`).all();

const selArtists = db.prepare('SELECT id, artist_name FROM post_artists WHERE post_id = ? AND discogs_artist_id IS NULL');
const selLabels  = db.prepare('SELECT id, label_name  FROM post_labels  WHERE post_id = ? AND discogs_label_id  IS NULL');
const updArtist  = db.prepare('UPDATE post_artists SET discogs_artist_id = ? WHERE id = ?');
const updLabel   = db.prepare('UPDATE post_labels  SET discogs_label_id  = ? WHERE id = ?');
const updPost    = db.prepare('UPDATE posts SET discogs_id = ? WHERE id = ? AND discogs_id IS NULL');

async function getJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.error ? null : data;
  } catch {
    return null;
  }
}

// Match stored rows against a Discogs [{ id, name }] list by normalised name.
// Single-row/single-candidate falls through to a positional match, since a
// one-artist release whose name was hand-edited is still unambiguous.
function pair(rows, nameKey, candidates) {
  const byName = new Map();
  for (const c of candidates || []) {
    const k = norm(c?.name);
    if (k && c?.id != null) byName.set(k, c.id);
  }
  const out = [];
  for (const row of rows) {
    let id = byName.get(norm(row[nameKey]));
    let how = 'name';
    if (id == null && rows.length === 1 && byName.size === 1) {
      id = [...byName.values()][0];
      how = 'only-candidate';
    }
    if (id != null) out.push({ row, id, how });
  }
  return out;
}

let touchedA = 0, touchedL = 0, skipped = 0;

console.log(`${posts.length} post(s) with missing Discogs ids.`);
console.log(APPLY ? '--apply set: writing changes.\n' : 'DRY RUN -- nothing will be written. Re-run with --apply.\n');

for (const p of posts) {
  const artistRows = selArtists.all(p.id);
  const labelRows  = selLabels.all(p.id);
  if (!artistRows.length && !labelRows.length) continue;

  let artists = null, labels = null, source = null, foundReleaseId = null;

  if (p.discogs_id) {
    const rel = await getJson(`${API}/discogs/release/${p.discogs_id}`);
    if (rel) {
      artists = rel.artists;
      labels  = rel.labels;
      source  = `release ${p.discogs_id}`;
    }
  }

  if (!artists && !labels && p.stream_url) {
    const res = await getJson(`${API}/media/resolve?url=${encodeURIComponent(p.stream_url)}`);
    if (res?.discogs_id) {
      artists = res.artists;
      labels  = res.label_id != null && res.label ? [{ id: res.label_id, name: res.label }] : null;
      source  = `reverse lookup -> release ${res.discogs_id}`;
      foundReleaseId = res.discogs_id;
    }
  }

  if (!artists && !labels) {
    skipped++;
    console.log(`#${p.id}  "${p.title}"  -> no Discogs match (${p.discogs_id ? 'release fetch failed' : p.stream_url ? 'reverse lookup found nothing' : 'no discogs_id and no stream_url'})`);
    continue;
  }

  const artistHits = pair(artistRows, 'artist_name', artists);
  const labelHits  = pair(labelRows,  'label_name',  labels);

  if (!artistHits.length && !labelHits.length) {
    skipped++;
    console.log(`#${p.id}  "${p.title}"  -> matched ${source}, but no name lined up ` +
      `(stored: ${[...artistRows.map(r => r.artist_name), ...labelRows.map(r => r.label_name)].join(' / ') || '-'} | ` +
      `discogs: ${[...(artists || []), ...(labels || [])].map(c => c.name).join(' / ') || '-'})`);
    continue;
  }

  const parts = [];
  for (const h of artistHits) parts.push(`${h.row.artist_name}=${h.id}${h.how === 'name' ? '' : '*'}`);
  for (const h of labelHits)  parts.push(`${h.row.label_name}=${h.id}${h.how === 'name' ? '' : '*'}`);
  console.log(`#${p.id}  "${p.title}"  -> ${source}: ${parts.join(', ')}`);

  if (APPLY) {
    const write = db.transaction(() => {
      for (const h of artistHits) updArtist.run(h.id, h.row.id);
      for (const h of labelHits)  updLabel.run(h.id, h.row.id);
      if (foundReleaseId) {
        // UNIQUE constraint on posts.discogs_id -- another post may already
        // claim this release, in which case leave the post as it is.
        try { updPost.run(Number(foundReleaseId), p.id); } catch { /* already taken */ }
      }
    });
    write();
  }
  touchedA += artistHits.length;
  touchedL += labelHits.length;
}

console.log(`\n${touchedA} artist row(s), ${touchedL} label row(s) ${APPLY ? 'updated' : 'would be updated'}. ${skipped} post(s) skipped.`);
console.log('(* = matched as the only candidate rather than by name)');
if (!APPLY) console.log('\nRe-run with --apply to write these.');
