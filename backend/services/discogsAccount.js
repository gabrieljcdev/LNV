import crypto from 'crypto';
import db from '../db/database.js';
import { discogsJson, getRelease, recordRelatedReleases } from './discogsService.js';
import { findFreeLink } from './trackSources.js';
import { logEvent } from './logService.js';
import { setName } from './entityNames.js';

// A listener's own Discogs collection and wantlist as two playlists (2026-10-08, gabriel).
//
// They give their Discogs username and the public collection / wantlist is read with the site's own
// token — no proof it is their account (`ownership: 'unverified'`), which is fine while the playlists
// are private to them and Discogs shows those lists to anyone. A private list can't be read that way
// (the status says so); a proper "Connect Discogs" login (OAuth) is the planned way to cover those,
// to verify the account, and to allow sharing. Meanwhile there is an optional check afterwards
// (verifyLink): they paste a short code into the "Profile" text box under Settings → Profile on
// Discogs and we read it back (GET /users/{name} returns `profile`), which marks the account verified.
//
// The two playlists are kind 'collection' and 'wantlist', private (no share link), and hold
// RELEASES, not tracks — a record has no playable link until someone opens it, so each release
// row is marked `playable` (1 = something plays, 0 = nothing found, null = not checked yet) by a
// slow background pass that only uses free sources (our own posts and saved links, Discogs'
// videos, Spotify / Deezer / Apple). The paid YouTube search still only runs when someone clicks.

db.exec(`
  CREATE TABLE IF NOT EXISTS discogs_links (
    user_id INTEGER PRIMARY KEY,
    discogs_username TEXT NOT NULL,
    verify_code TEXT,
    verified_at TEXT,
    want_collection INTEGER NOT NULL DEFAULT 1,
    want_wantlist INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    collection_total INTEGER,
    wantlist_total INTEGER,
    collection_playlist_id INTEGER,
    wantlist_playlist_id INTEGER,
    last_sync_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS playlist_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    discogs_id INTEGER NOT NULL,
    title TEXT,
    artist TEXT,
    label TEXT,
    catno TEXT,
    year INTEGER,
    format TEXT,
    cover TEXT,
    added_at TEXT,
    playable INTEGER,
    checked_at TEXT,
    seen_run INTEGER,
    UNIQUE (playlist_id, discogs_id)
  );
  CREATE INDEX IF NOT EXISTS idx_playlist_releases ON playlist_releases(playlist_id, added_at);
  CREATE INDEX IF NOT EXISTS idx_playlist_releases_check ON playlist_releases(playable, checked_at);
`);

// The records' ids are kept (label, artists) so the rows can link out later.
try { db.exec('ALTER TABLE playlist_releases ADD COLUMN label_id INTEGER'); } catch { /* already there */ }
try { db.exec('ALTER TABLE playlist_releases ADD COLUMN artists_json TEXT'); } catch { /* already there */ }

// How sure we are the account is theirs: 'unverified' (they typed the username — fine while the lists are
// private to them and Discogs shows them publicly anyway), 'profile-code' (a code read back from their
// profile text), 'oauth' (they signed in with Discogs — planned, and what private lists and sharing need).
try { db.exec("ALTER TABLE discogs_links ADD COLUMN ownership TEXT NOT NULL DEFAULT 'unverified'"); } catch { /* already there */ }

// Links made while a code was still required ('pending') were chosen by the listener, so they count as
// linked now and the import runs (the code check is optional).
db.prepare("UPDATE discogs_links SET verified_at = datetime('now'), state = 'verified', error = NULL WHERE verified_at IS NULL").run();

// The two lists are private to their owner until sharing is switched on: not on the profile, no share link.
db.prepare("UPDATE playlists SET on_profile = 0, share_token = NULL, invite_token = NULL WHERE kind IN ('collection', 'wantlist')").run();

const USERNAME_OK = /^[A-Za-z0-9_.-]{1,60}$/;
const PAGE_GAP_MS = 2500;      // between import pages — the shared token's 60 a minute is also the crawler's
const CHECK_GAP_MS = 4000;     // between playable checks
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanName = n => String(n || '').replace(/\s*\(\d+\)$/, '').trim();

const link = userId => db.prepare('SELECT * FROM discogs_links WHERE user_id = ?').get(userId);

function ensurePlaylist(userId, kind, name) {
  const col = `${kind}_playlist_id`;
  const l = link(userId);
  const have = l?.[col] ? db.prepare('SELECT id FROM playlists WHERE id = ? AND owner_id = ?').get(l[col], userId) : null;
  if (have) return have.id;
  // Private: not on the profile, no share link (the owner can't share these yet).
  const r = db.prepare("INSERT INTO playlists (owner_id, name, kind, on_profile, share_token) VALUES (?, ?, ?, 0, NULL)").run(userId, name, kind);
  db.prepare(`UPDATE discogs_links SET ${col} = ? WHERE user_id = ?`).run(r.lastInsertRowid, userId);
  return r.lastInsertRowid;
}

// ── linking ───────────────────────────────────────────────────────────────────

export function startLink(userId, username, { collection = true, wantlist = true } = {}) {
  const name = String(username || '').trim();
  if (!USERNAME_OK.test(name)) return { error: 'That doesn’t look like a Discogs username.' };
  const cur = link(userId);
  const same = cur && cur.discogs_username.toLowerCase() === name.toLowerCase();
  const code = same && cur.verify_code ? cur.verify_code : `lnv-${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(`INSERT INTO discogs_links (user_id, discogs_username, verify_code, want_collection, want_wantlist, state, verified_at, ownership)
              VALUES (?, ?, ?, ?, ?, 'verified', datetime('now'), 'unverified')
              ON CONFLICT(user_id) DO UPDATE SET
                discogs_username = excluded.discogs_username, verify_code = excluded.verify_code,
                want_collection = excluded.want_collection, want_wantlist = excluded.want_wantlist,
                state = 'verified', error = NULL,
                verified_at = COALESCE(discogs_links.verified_at, datetime('now')),
                ownership = CASE WHEN ? THEN discogs_links.ownership ELSE 'unverified' END`)
    .run(userId, name, code, collection ? 1 : 0, wantlist ? 1 : 0, same ? 1 : 0);
  startImport(userId);
  return status(userId);
}

export async function verifyLink(userId) {
  const l = link(userId);
  if (!l) return { error: 'Start by entering your Discogs username.' };
  const { status: code, data } = await discogsJson(`/users/${encodeURIComponent(l.discogs_username)}`);
  if (code === 404) return { error: `Discogs has no user called “${l.discogs_username}”.` };
  if (!data) return { error: 'Discogs didn’t answer — try again in a moment.' };
  if (!String(data.profile || '').toLowerCase().includes(String(l.verify_code).toLowerCase())) {
    return { verified: false, message: `We couldn’t find ${l.verify_code} in the “Profile” text box of “${data.username}” yet. On Discogs go to Settings → Profile, paste it into that box, save, then check again.` };
  }
  // Only the proof is recorded: the lists were already imported when they linked.
  db.prepare("UPDATE discogs_links SET discogs_username = ?, ownership = 'profile-code' WHERE user_id = ?").run(data.username || l.discogs_username, userId);
  return { verified: true, ...status(userId) };
}

export function unlink(userId) {
  const l = link(userId);
  if (!l) return { ok: true };
  db.transaction(() => {
    for (const col of ['collection_playlist_id', 'wantlist_playlist_id']) {
      if (!l[col]) continue;
      db.prepare('DELETE FROM playlist_releases WHERE playlist_id = ?').run(l[col]);
      db.prepare('DELETE FROM playlists WHERE id = ? AND owner_id = ?').run(l[col], userId);
    }
    db.prepare('DELETE FROM discogs_links WHERE user_id = ?').run(userId);
  })();
  return { ok: true };
}

export function status(userId) {
  const l = link(userId);
  if (!l) return { linked: false };
  const count = (pid, where = '') => (pid ? db.prepare(`SELECT COUNT(*) c FROM playlist_releases WHERE playlist_id = ? ${where}`).get(pid).c : 0);
  const cp = l.collection_playlist_id, wp = l.wantlist_playlist_id;
  return {
    linked: true,
    username: l.discogs_username,
    verified: !!l.verified_at,
    ownership: l.ownership || 'unverified',
    // the code to paste into the Discogs profile text, offered until the account is checked
    code: (l.ownership || 'unverified') === 'unverified' ? l.verify_code : undefined,
    state: l.state,
    error: l.error || null,
    last_sync_at: l.last_sync_at,
    collection: { on: !!l.want_collection, playlist_id: cp, total: l.collection_total, imported: count(cp) },
    wantlist: { on: !!l.want_wantlist, playlist_id: wp, total: l.wantlist_total, imported: count(wp) },
    checked: { done: count(cp, 'AND playable IS NOT NULL') + count(wp, 'AND playable IS NOT NULL'), total: count(cp) + count(wp) },
  };
}

// ── the import ────────────────────────────────────────────────────────────────

const importQueue = [];
let importing = false;
export function startImport(userId) {
  const l = link(userId);
  if (!l?.verified_at) return;
  if (!importQueue.includes(userId)) importQueue.push(userId);
  db.prepare("UPDATE discogs_links SET state = 'importing', error = NULL WHERE user_id = ?").run(userId);
  drainImports();
}

async function drainImports() {
  if (importing) return;
  importing = true;
  try {
    while (importQueue.length) {
      const userId = importQueue.shift();
      try { await importFor(userId); }
      catch (err) {
        db.prepare("UPDATE discogs_links SET state = 'error', error = ? WHERE user_id = ?").run(String(err.message || err).slice(0, 300), userId);
        logEvent('error', 'crawl', `Discogs account import for user ${userId}: ${err.message}`);
      }
    }
  } finally { importing = false; kickChecks(); }
}

const formatOf = bi => (bi.formats || []).map(f => [f.qty > 1 ? `${f.qty}x${f.name}` : f.name, ...(f.descriptions || [])].join(', ')).join(' + ');

async function importList(l, kind, run) {
  const pid = ensurePlaylist(l.user_id, kind, kind === 'collection' ? 'My Discogs collection' : 'My Discogs wantlist');
  const path = u => (kind === 'collection'
    ? `/users/${encodeURIComponent(l.discogs_username)}/collection/folders/0/releases?per_page=100&sort=added&sort_order=desc&page=${u}`
    : `/users/${encodeURIComponent(l.discogs_username)}/wants?per_page=100&page=${u}`);
  const put = db.prepare(`INSERT INTO playlist_releases (playlist_id, discogs_id, title, artist, label, catno, year, format, cover, added_at, seen_run, label_id, artists_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(playlist_id, discogs_id) DO UPDATE SET
      title = excluded.title, artist = excluded.artist, label = excluded.label, catno = excluded.catno, year = excluded.year,
      format = excluded.format, cover = excluded.cover, added_at = excluded.added_at, seen_run = excluded.seen_run,
      label_id = excluded.label_id, artists_json = excluded.artists_json`);
  let page = 1, pages = 1, total = null;
  const maxPages = Number(process.env.DISCOGS_IMPORT_MAX_PAGES) || Infinity; // a dev knob for testing
  while (page <= pages && page <= maxPages) {
    const { status: code, data } = await discogsJson(path(page));
    if (code === 403 || code === 401) return { pid, private: true };
    if (code === 404) return { pid, missing: true };
    if (!data) throw new Error(`Discogs ${kind} page ${page}: ${code}`);
    pages = data.pagination?.pages || 1;
    total = data.pagination?.items ?? total;
    const items = (kind === 'collection' ? data.releases : data.wants) || [];
    const forCatalogue = [];
    db.transaction(() => {
      for (const it of items) {
        const bi = it.basic_information || {};
        const id = Number(bi.id || it.id);
        if (!id) continue;
        const artists = (bi.artists || []).filter(a => a?.name).map(a => ({ id: a.id || null, name: cleanName(a.name) }));
        const lab = (bi.labels || [])[0] || {};
        const artistText = artists.map(a => a.name).join(', ');
        put.run(pid, id, bi.title || '', artistText, cleanName(lab.name || ''), lab.catno || '', bi.year || null, formatOf(bi),
          bi.cover_image || bi.thumb || null, it.date_added || null, run, lab.id || null, JSON.stringify(artists));
        forCatalogue.push({ discogs_id: id, release_title: `${artistText} - ${bi.title || ''}`, artists, label: cleanName(lab.name || ''), label_id: lab.id || null,
          catNo: lab.catno || '', year: bi.year || null, cover_image: bi.thumb || bi.cover_image || null, format: formatOf(bi) });
      }
    })();
    // The same records join the site's catalogue: filed under their artists and labels, and each of those
    // artists and labels queued for a full catalogue crawl, like the ones on posts.
    try { recordRelatedReleases([], forCatalogue); } catch (err) { logEvent('error', 'crawl', `Discogs account → catalogue: ${err.message}`); }
    page++;
    if (page <= pages) await sleep(PAGE_GAP_MS);
  }
  if (page <= pages) return { pid, total }; // stopped early by the test knob: keep what's there
  // Anything no longer on the Discogs list goes (the list was walked in full).
  db.prepare('DELETE FROM playlist_releases WHERE playlist_id = ? AND (seen_run IS NULL OR seen_run != ?)').run(pid, run);
  return { pid, total };
}

async function importFor(userId) {
  const l = link(userId);
  if (!l?.verified_at) return;
  const run = Date.now();
  const notes = [];
  if (l.want_collection) {
    const r = await importList(l, 'collection', run);
    if (r.private) notes.push('Your Discogs collection is private — make it public on Discogs (Settings → Privacy) and refresh.');
    else if (r.missing) notes.push('Discogs couldn’t find your collection.');
    else db.prepare('UPDATE discogs_links SET collection_total = ? WHERE user_id = ?').run(r.total, userId);
    await sleep(PAGE_GAP_MS);
  }
  if (l.want_wantlist) {
    const r = await importList(l, 'wantlist', run);
    if (r.private) notes.push('Your Discogs wantlist is private — make it public on Discogs (Settings → Privacy) and refresh.');
    else if (r.missing) notes.push('Discogs couldn’t find your wantlist.');
    else db.prepare('UPDATE discogs_links SET wantlist_total = ? WHERE user_id = ?').run(r.total, userId);
  }
  db.prepare("UPDATE discogs_links SET state = 'ready', error = ?, last_sync_at = datetime('now') WHERE user_id = ?").run(notes.join(' ') || null, userId);
}

// ── playable? ─────────────────────────────────────────────────────────────────
// Is there anything that plays for this release, using only free checks?

async function checkRelease(discogsId) {
  // 1. a post on the site already carries it, with links
  if (db.prepare(`SELECT 1 FROM posts p JOIN post_tracks t ON t.post_id = p.id
                  WHERE p.discogs_id = ? AND (COALESCE(t.stream_url, '') != '' OR COALESCE(t.youtube_url, '') != ''
                    OR EXISTS (SELECT 1 FROM track_sources s WHERE s.track_id = t.id)) LIMIT 1`).get(discogsId)) return 1;
  // 2. links already found for it
  if (db.prepare('SELECT 1 FROM release_track_links WHERE release_id = ? AND (youtube_url IS NOT NULL OR spotify_url IS NOT NULL) LIMIT 1').get(discogsId)) return 1;
  // 3. Discogs' own videos; 4. a free source for its first couple of tracks
  const rel = await getRelease(discogsId, { background: true });
  if ((rel.videos || []).some(v => /youtu/.test(v.url || ''))) return 1;
  const artist = (rel.artists || []).map(a => a.name).join(', ');
  const tracks = (rel.tracklist || []).filter(t => t.title && t.position).slice(0, 2);
  for (const t of tracks) {
    const who = (t.artists || []).map(a => a.name).join(', ') || artist;
    if (await findFreeLink(who, t.title).catch(() => null)) return 1;
  }
  return 0;
}

let checking = false;
async function drainChecks() {
  if (checking) return;
  checking = true;
  try {
    for (;;) {
      const row = db.prepare(`SELECT pr.discogs_id FROM playlist_releases pr
        WHERE pr.playable IS NULL OR (pr.playable = 0 AND pr.checked_at < datetime('now', '-14 days'))
        ORDER BY pr.playable IS NOT NULL, pr.id LIMIT 1`).get();
      if (!row) break;
      let result = null;
      try { result = await checkRelease(row.discogs_id); }
      catch (err) { if (err.message && /429/.test(err.message)) { await sleep(60000); continue; } result = null; }
      // A release that errors (gone from Discogs) is recorded as unchecked-for-now, retried in 14 days.
      db.prepare("UPDATE playlist_releases SET playable = ?, checked_at = datetime('now') WHERE discogs_id = ? AND (playable IS NULL OR playable = 0)")
        .run(result === null ? 0 : result, row.discogs_id);
      await sleep(CHECK_GAP_MS);
    }
  } finally { checking = false; }
}
export function kickChecks() { drainChecks().catch(err => console.error('[discogs account checks]', err.message)); }

// ── reading them ──────────────────────────────────────────────────────────────

export function releasesFor(playlistId, { offset = 0, limit = 100, q = '' } = {}) {
  const term = String(q || '').trim().toLowerCase();
  const where = term ? "AND (lower(title) LIKE ? OR lower(artist) LIKE ? OR lower(label) LIKE ?)" : '';
  const args = term ? [`%${term}%`, `%${term}%`, `%${term}%`] : [];
  const total = db.prepare(`SELECT COUNT(*) c FROM playlist_releases WHERE playlist_id = ? ${where}`).get(playlistId, ...args).c;
  const releases = db.prepare(`SELECT discogs_id, title, artist, label, catno, year, format, cover, added_at, playable FROM playlist_releases
    WHERE playlist_id = ? ${where} ORDER BY added_at DESC, id LIMIT ? OFFSET ?`).all(playlistId, ...args, Math.min(Number(limit) || 100, 200), Math.max(Number(offset) || 0, 0));
  return { total, releases };
}

// The viewer's own records with their artist and label ids: the Artists and Labels tabs list these
// beside the ones from posts (2026-10-09). Private to the owner, like the playlists themselves.
export function recordsFor(userId) {
  const rows = db.prepare(`SELECT r.discogs_id, r.title, r.label, r.label_id, r.catno, r.year, r.cover, r.artists_json, p.kind AS list
    FROM playlist_releases r JOIN playlists p ON p.id = r.playlist_id
    WHERE p.owner_id = ? AND p.kind IN ('collection', 'wantlist') ORDER BY r.added_at DESC`).all(userId);
  const seen = new Map();
  for (const r of rows) {
    const have = seen.get(r.discogs_id);
    if (have) { have.lists.push(r.list); continue; }
    let artists = [];
    try { artists = JSON.parse(r.artists_json || '[]'); } catch { artists = []; }
    seen.set(r.discogs_id, { discogs_id: r.discogs_id, title: r.title, label: r.label, label_id: r.label_id, catno: r.catno, year: r.year, cover: r.cover, artists, lists: [r.list] });
  }
  return { records: [...seen.values()] };
}

// Names for the artists and labels of already-imported records (they were imported before names were stored).
export function seedNamesFromImports() {
  for (const r of db.prepare('SELECT artists_json, label, label_id FROM playlist_releases WHERE artists_json IS NOT NULL').all()) {
    try { for (const a of JSON.parse(r.artists_json)) if (a?.id) setName('artist', a.id, a.name); } catch { /* skip a bad row */ }
    if (r.label_id && r.label) setName('label', r.label_id, r.label);
  }
}

// ── upkeep ────────────────────────────────────────────────────────────────────

export function startDiscogsAccountKeeper() {
  const sweep = () => {
    try {
      // Resume interrupted imports; refresh each linked account once a day.
      // Also any account whose records were imported before their artist / label ids were kept.
      for (const l of db.prepare(`SELECT l.user_id FROM discogs_links l WHERE l.verified_at IS NOT NULL AND l.state != 'error' AND (
          l.state = 'importing' OR l.last_sync_at IS NULL OR l.last_sync_at < datetime('now', '-1 day')
          OR EXISTS (SELECT 1 FROM playlist_releases r WHERE r.artists_json IS NULL AND r.playlist_id IN (l.collection_playlist_id, l.wantlist_playlist_id)))`).all()) startImport(l.user_id);
      kickChecks();
    } catch (err) { console.error('[discogs account keeper]', err.message); }
  };
  setTimeout(sweep, 20000);
  setInterval(sweep, 60 * 60 * 1000);
}
