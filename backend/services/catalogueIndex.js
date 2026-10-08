// Full-text search over the stored Discogs catalogues (2026-10-07). The
// catalogue is meant to grow to tens of millions of rows; looking a title up
// by scanning every row (instr over the lot) was 277 ms at 580k rows and would
// be seconds at 10M. FTS5 answers in about a millisecond whatever the size.
//
// An "external content" index: it holds only the search terms (title, artist,
// catalogue number), not a second copy of the rows, and is kept current by
// triggers — so the crawler never has to know about it. The rows must be
// updated in place (upsert), not replaced: SQLite does not fire delete
// triggers for REPLACE, which would leave stale entries behind.

import db from '../db/database.js';

let ready = false;
export const catalogueSearchReady = () => ready;

export function setupCatalogueIndex() {
  try {
    const existed = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'catalogue_fts'").get();
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS catalogue_fts USING fts5(
      title, artist, catno, content='discogs_catalogue', content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2')`);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS catalogue_fts_ai AFTER INSERT ON discogs_catalogue BEGIN
        INSERT INTO catalogue_fts(rowid, title, artist, catno) VALUES (new.rowid, new.title, new.artist, new.catno);
      END;
      CREATE TRIGGER IF NOT EXISTS catalogue_fts_ad AFTER DELETE ON discogs_catalogue BEGIN
        INSERT INTO catalogue_fts(catalogue_fts, rowid, title, artist, catno) VALUES ('delete', old.rowid, old.title, old.artist, old.catno);
      END;
      CREATE TRIGGER IF NOT EXISTS catalogue_fts_au AFTER UPDATE OF title, artist, catno ON discogs_catalogue BEGIN
        INSERT INTO catalogue_fts(catalogue_fts, rowid, title, artist, catno) VALUES ('delete', old.rowid, old.title, old.artist, old.catno);
        INSERT INTO catalogue_fts(rowid, title, artist, catno) VALUES (new.rowid, new.title, new.artist, new.catno);
      END;`);
    // First time only: index what is already stored (580k rows ≈ 2 s).
    if (!existed) db.exec("INSERT INTO catalogue_fts(catalogue_fts) VALUES('rebuild')");
    ready = true;
  } catch (err) {
    console.error('[catalogue index]', err.message);   // search falls back to scanning
  }
}

// "moon light" -> every word must appear, the last as a prefix: "moon" "light"*
export function ftsQuery(term) {
  const words = String(term || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length) return '';
  return words.map((w, i) => `"${w}"${i === words.length - 1 ? '*' : ''}`).join(' ');
}

// rowids of releases whose title / artist / catno match `term`.
export function searchCatalogueRowids(term, limit = 25) {
  const q = ftsQuery(term);
  if (!q) return [];
  return db.prepare('SELECT rowid FROM catalogue_fts WHERE catalogue_fts MATCH ? LIMIT ?').all(q, limit).map(r => r.rowid);
}
