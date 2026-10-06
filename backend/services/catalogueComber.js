// The duplicate comber (2026-10-06, gabriel: "a system for weeding this out
// … something sophisticated to confirm it's a duplicate and not jump the
// gun"). Discogs lists every pressing of a record on its own — a big label's
// catalogue has Thriller 609 times — and an artist's catalogue can hold a
// record AND one of its pressings. The comber works through every stored
// catalogue (discogs_catalogue) in the background and folds pressings of the
// same record into one row with a versions count. Nothing is deleted.
//
// How it decides — never on a title alone:
// 1. Suspects: rows in one catalogue with the same artist and the same title
//    (after tidying "(Remastered)", "Deluxe Edition" and the like).
// 2. Proof: Discogs' own grouping. Every pressing points to its master
//    release; rows are folded only when Discogs puts them under the SAME
//    master. Two different masters are two different records, even with the
//    same name (Richie Hawtin's three "From My Mind To Yours", Andrés'
//    three "Untitled") — they stay apart.
// 3. Cost: for an ordinary title, two pressings are checked; if both point
//    to the same master the whole suspect group is confirmed. If they
//    disagree — or the title is generic ("Untitled", "Greatest Hits",
//    "Remixes"…), or the artist is "Various" — every pressing is checked.
//    A pressing Discogs never linked to a master (a white-label promo, a
//    digital upload) joins a record only when its TRACKLIST matches that
//    record's: at least 80% of the titles the same and the counts within
//    one (exact for one- or two-track records). Otherwise it stays apart.
// 4. Pace: one Discogs call every CHECK_GAP_MS in the background (each
//    answer is cached, so a release is checked once, ever). A catalogue
//    someone is looking at goes to the front of the queue; small catalogues
//    (the labels people actually post) go before huge major-label ones.
//
// Columns on discogs_catalogue: work_key (artist|title, tidied), master_id
// (NULL = not checked, 0 = Discogs has none), dup_of ('type:id' of the row
// it's folded under; NULL = shown), combed_at (this row's group is settled).

import db from '../db/database.js';
import { releaseMasterId, getRelease, getMaster } from './discogsService.js';
import { logEvent } from './logService.js';

for (const sql of [
  'ALTER TABLE discogs_catalogue ADD COLUMN work_key TEXT',
  'ALTER TABLE discogs_catalogue ADD COLUMN master_id INTEGER',
  'ALTER TABLE discogs_catalogue ADD COLUMN dup_of TEXT',
  'ALTER TABLE discogs_catalogue ADD COLUMN combed_at TEXT',
  'CREATE INDEX IF NOT EXISTS idx_catalogue_work ON discogs_catalogue(kind, entity_id, work_key)',
  'CREATE INDEX IF NOT EXISTS idx_catalogue_dup ON discogs_catalogue(kind, entity_id, dup_of)',
]) { try { db.exec(sql); } catch { /* already there */ } }

const CHECK_GAP_MS = 2500;   // ≈24 Discogs calls a minute, leaving room for the rest
const IDLE_MS = 60_000;      // nothing to do: look again in a minute
const TURN_CALLS = 20;       // Discogs checks per turn, then the queue is looked at again
const sleep = ms => new Promise(r => setTimeout(r, ms));

// "Thriller (Remastered)", "THRILLER", "Thriller - Deluxe Edition" → "thriller".
const EDITION = /\s*[([][^)\]]*\b(?:remaster(?:ed)?|deluxe|edition|reissue|expanded|anniversary|bonus|special|limited|re-?press|version)\b[^)\]]*[)\]]\s*/gi;
export function tidyTitle(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(EDITION, ' ')
    .replace(/\s+-\s+(?:remaster(?:ed)?|deluxe(?: edition)?|\d{4} remaster).*$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const tidyArtist = s => String(s || '').replace(/\s*\(\d+\)$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const workKey = r => `${tidyArtist(r.artist)}|${tidyTitle(r.title)}`;
const GENERIC = /^(?:untitled(?: ep| lp)?|s ?t|self titled|greatest hits.*|best of.*|the best of.*|hits|remixes|the remixes|ep|lp|live|singles|collection|the collection|anthology|gold|essentials?|vol(?:ume)? ?\d*|part ?\d*|\d+|demo|promo|sampler)$/;
const needsFullCheck = (artist, title) => GENERIC.test(tidyTitle(title)) || /^(?:various|various artists|unknown artist|)$/.test(tidyArtist(artist));

// ── queue ────────────────────────────────────────────────────────────────────
const urgent = [];             // catalogues someone is looking at
export function combSoon(kind, id) {
  const k = `${kind}:${id}`;
  if (!urgent.includes(k)) urgent.unshift(k);
  if (urgent.length > 20) urgent.length = 20;
}
// The next catalogue with unsettled rows: an urgent one, else the smallest.
function nextCatalogue() {
  while (urgent.length) {
    const [kind, id] = urgent[0].split(':');
    if (db.prepare('SELECT 1 FROM discogs_catalogue WHERE kind = ? AND entity_id = ? AND combed_at IS NULL LIMIT 1').get(kind, Number(id))) return { kind, id: Number(id) };
    urgent.shift();
  }
  return db.prepare(`SELECT kind, entity_id AS id FROM discogs_catalogue GROUP BY kind, entity_id
    HAVING SUM(combed_at IS NULL) > 0 ORDER BY COUNT(*) LIMIT 1`).get() || null;
}

// ── one catalogue ────────────────────────────────────────────────────────────
// The comber works in slices: after TURN_CALLS checks — or as soon as
// someone opens another catalogue — it pauses. Every answer is already
// saved (master_id, the Discogs cache), so the next turn carries on.
let calls = 0, turnCalls = 0, current = null;
class Pause extends Error {}
function spend() {
  calls++; turnCalls++;
  if (turnCalls >= TURN_CALLS || (urgent.length && urgent[0] !== current)) throw new Pause();
}
async function masterOf(row) {
  if (row.item_type === 'master') return row.item_id;
  if (row.master_id != null) return row.master_id;
  const m = await releaseMasterId(row.item_id);
  db.prepare('UPDATE discogs_catalogue SET master_id = ? WHERE kind = ? AND entity_id = ? AND item_type = ? AND item_id = ?')
    .run(m, row.kind, row.entity_id, row.item_type, row.item_id);
  row.master_id = m;
  await sleep(CHECK_GAP_MS);
  spend();
  return m;
}

// A row's track titles, tidied — from the cache, else one background call.
const cachedKey = r => (r.item_type === 'master' ? `master:${r.item_id}` : `release:${r.item_id}`);
async function tracksOf(r) {
  const cached = !!db.prepare('SELECT 1 FROM discogs_cache WHERE cache_key = ?').get(cachedKey(r));
  const d = r.item_type === 'master' ? await getMaster(r.item_id, { background: true }) : await getRelease(r.item_id, { background: true });
  if (!cached) { await sleep(CHECK_GAP_MS); spend(); }
  return (d?.tracklist || []).map(t => tidyTitle(t.title)).filter(Boolean);
}
// Same record by its tracks? (see 3. above)
function sameTracks(a, b) {
  if (!a.length || !b.length || Math.abs(a.length - b.length) > 1) return false;
  if (Math.max(a.length, b.length) <= 2) return a.length === b.length && a.every(t => b.includes(t));
  const B = new Set(b);
  return a.filter(t => B.has(t)).length / Math.max(a.length, b.length) >= 0.8;
}

// Folds one suspect group by what Discogs says; returns rows folded.
async function settleGroup(rows) {
  const full = needsFullCheck(rows[0].artist, rows[0].title);
  const masters = new Map(); // row -> master id
  for (const r of rows.filter(x => x.item_type === 'master' || x.master_id != null)) masters.set(r, r.item_type === 'master' ? r.item_id : r.master_id);
  const unknown = rows.filter(r => !masters.has(r));
  let sampled = false;
  if (!full && unknown.length) {
    // Two pressings (far apart in time when possible) as the sample.
    const byYear = [...unknown].sort((a, b) => (a.year || 9999) - (b.year || 9999));
    // Rows already checked (an earlier, paused turn) count towards the two.
    const need = Math.max(0, 2 - masters.size);
    const sample = [...new Set([byYear[0], byYear[byYear.length - 1]])].slice(0, need);
    for (const r of sample) masters.set(r, await masterOf(r));
    const seen = new Set([...masters.values()].filter(m => m));
    const zero = [...masters.values()].some(m => !m);
    if (seen.size === 1 && !zero) {
      // Confirmed: Discogs puts the sample (and any masters) under one record.
      const m = [...seen][0];
      for (const r of unknown) if (!masters.has(r)) masters.set(r, m);
      sampled = true;
    }
  }
  if (!sampled) for (const r of rows) if (!masters.has(r)) masters.set(r, await masterOf(r));

  // Cluster by master. A pressing without one joins a cluster — or another
  // loose pressing — only when their tracklists match (sameTracks).
  const byMaster = new Map();
  for (const [r, m] of masters) if (m) { if (!byMaster.has(m)) byMaster.set(m, []); byMaster.get(m).push(r); }
  const groups = [...byMaster.values()];
  const loose = [...masters].filter(([, m]) => !m).map(([r]) => r);
  if (loose.length) {
    const seen = new Map();
    const tracks = async r => { if (!seen.has(r)) seen.set(r, await tracksOf(r)); return seen.get(r); };
    for (const r of loose) {
      const mine = await tracks(r);
      let home = null;
      for (const g of groups) {
        const head = g.find(x => x.item_type === 'master') || g[0];
        if (sameTracks(mine, await tracks(head))) { home = g; break; }
      }
      if (home) home.push(r); else groups.push([r]);
    }
  }
  let folded = 0;
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const r of rows) {
      db.prepare('UPDATE discogs_catalogue SET dup_of = NULL, combed_at = ? WHERE kind = ? AND entity_id = ? AND item_type = ? AND item_id = ?')
        .run(now, r.kind, r.entity_id, r.item_type, r.item_id);
    }
    for (const group of groups) {
      if (group.length < 2) continue;
      // The row to show: the master itself, else the earliest pressing.
      const rep = group.find(r => r.item_type === 'master')
        || [...group].sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.item_id - b.item_id)[0];
      const repKey = `${rep.item_type}:${rep.item_id}`;
      for (const r of group) {
        if (r === rep) continue;
        db.prepare('UPDATE discogs_catalogue SET dup_of = ? WHERE kind = ? AND entity_id = ? AND item_type = ? AND item_id = ?')
          .run(repKey, r.kind, r.entity_id, r.item_type, r.item_id);
        folded++;
      }
      // The rep remembers its master, for the "N versions" link to Discogs.
      if (rep.item_type === 'release') db.prepare('UPDATE discogs_catalogue SET master_id = ? WHERE kind = ? AND entity_id = ? AND item_type = ? AND item_id = ?')
        .run(masters.get(rep) || 0, rep.kind, rep.entity_id, rep.item_type, rep.item_id);
    }
  })();
  return folded;
}

async function combCatalogue({ kind, id }) {
  current = `${kind}:${id}`;
  turnCalls = 0;
  // Keys first (no network), then everything that has no twin is settled.
  const fill = db.prepare('UPDATE discogs_catalogue SET work_key = ? WHERE kind = ? AND entity_id = ? AND item_type = ? AND item_id = ?');
  db.transaction(() => {
    for (const r of db.prepare('SELECT kind, entity_id, item_type, item_id, title, artist FROM discogs_catalogue WHERE kind = ? AND entity_id = ? AND work_key IS NULL').all(kind, id)) fill.run(workKey(r), r.kind, r.entity_id, r.item_type, r.item_id);
  })();
  db.prepare(`UPDATE discogs_catalogue SET combed_at = datetime('now') WHERE kind = ? AND entity_id = ? AND combed_at IS NULL
    AND work_key IN (SELECT work_key FROM discogs_catalogue WHERE kind = ? AND entity_id = ? GROUP BY work_key HAVING COUNT(*) = 1)`).run(kind, id, kind, id);
  // Then suspect groups with anything unsettled — a few per turn, so an
  // urgent catalogue elsewhere isn't kept waiting long.
  const keys = db.prepare(`SELECT work_key FROM discogs_catalogue WHERE kind = ? AND entity_id = ? GROUP BY work_key
    HAVING COUNT(*) > 1 AND SUM(combed_at IS NULL) > 0 ORDER BY COUNT(*), MAX(year) DESC LIMIT 25`).all(kind, id).map(r => r.work_key);
  let folded = 0;
  try {
    for (const k of keys) {
      const rows = db.prepare('SELECT * FROM discogs_catalogue WHERE kind = ? AND entity_id = ? AND work_key = ?').all(kind, id, k);
      folded += await settleGroup(rows);
      if (urgent.length && urgent[0] !== current) break;
    }
  } catch (err) {
    if (!(err instanceof Pause)) throw err; // a slice's worth done; next turn carries on
  }
  return folded;
}

let running = false;
export function startCatalogueComber() {
  if (running) return;
  running = true;
  (async () => {
    await sleep(30_000); // after the other startup jobs
    for (;;) {
      try {
        const next = nextCatalogue();
        if (!next) { await sleep(IDLE_MS); continue; }
        const folded = await combCatalogue(next);
        if (folded) logEvent('info', 'crawl', `Duplicate comber: folded ${folded} pressing${folded === 1 ? '' : 's'} in ${next.kind} ${next.id}`);
      } catch (err) {
        if (err.rateLimited) { await sleep(60_000); continue; }
        console.error('[comber]', err.message);
        logEvent('error', 'crawl', `Duplicate comber: ${err.message}`);
        await sleep(IDLE_MS);
      }
    }
  })();
}

// For Admin → Status.
export function comberStats() {
  const one = sql => db.prepare(sql).get().c;
  return {
    folded: one('SELECT COUNT(*) c FROM discogs_catalogue WHERE dup_of IS NOT NULL'),
    shown: one('SELECT COUNT(*) c FROM discogs_catalogue WHERE dup_of IS NULL'),
    unsettled: one('SELECT COUNT(*) c FROM discogs_catalogue WHERE combed_at IS NULL'),
    checks: calls,
  };
}
