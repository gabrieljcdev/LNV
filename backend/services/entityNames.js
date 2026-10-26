import db from '../db/database.js';

// Names for the artists and labels in the catalogue crawl (2026-10-09). The crawl is keyed by Discogs id,
// and a name used to be known only when a post carried that artist or label — so Admin showed the rest
// as "#160". Names now come from: posts (syncNamesFromPosts), every record that enters the catalogue
// (recordRelatedReleases, the Discogs account import) and, for anything still unnamed, a slow
// background lookup (entityNameResolver.js).
db.exec(`CREATE TABLE IF NOT EXISTS discogs_names (
  kind TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (kind, entity_id)
)`);

const clean = n => String(n || '').replace(/\s*\(\d+\)$/, '').trim();

export function setName(kind, id, name) {
  const n = clean(name);
  if (!n || !Number(id) || Number(id) === 194) return;
  db.prepare("INSERT INTO discogs_names (kind, entity_id, name) VALUES (?, ?, ?) ON CONFLICT(kind, entity_id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')").run(kind, Number(id), n);
}

export const nameFor = (kind, id) => db.prepare('SELECT name FROM discogs_names WHERE kind = ? AND entity_id = ?').get(kind, Number(id))?.name || null;

export function syncNamesFromPosts() {
  db.prepare("INSERT OR IGNORE INTO discogs_names (kind, entity_id, name) SELECT 'artist', discogs_artist_id, artist_name FROM post_artists WHERE discogs_artist_id IS NOT NULL AND discogs_artist_id != 194 AND COALESCE(artist_name, '') != '' GROUP BY discogs_artist_id").run();
  db.prepare("INSERT OR IGNORE INTO discogs_names (kind, entity_id, name) SELECT 'label', discogs_label_id, label_name FROM post_labels WHERE discogs_label_id IS NOT NULL AND COALESCE(label_name, '') != '' GROUP BY discogs_label_id").run();
}
