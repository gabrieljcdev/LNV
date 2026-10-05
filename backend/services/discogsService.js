import fetch from 'node-fetch';
import dotenv from 'dotenv';
import db from '../db/database.js';
import { logEvent } from './logService.js';
dotenv.config();

const DISCOGS_BASE = 'https://api.discogs.com';
// Discogs releases never change — cache forever (30 days TTL is generous)
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

// Every Discogs call made for a person using the site goes through fgFetch,
// which notes the time: the background catalogue crawl only sends a page
// after CATALOGUE_QUIET_MS without one, so it never competes with them.
let lastForeground = 0;
function fgFetch(url, opts) {
  lastForeground = Date.now();
  return fetch(url, opts);
}

function getHeaders() {
  return {
    'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN}`,
    'User-Agent': 'LateNightVibes/1.0',
  };
}

function getCached(key) {
  try {
    const row = db.prepare('SELECT * FROM discogs_cache WHERE cache_key = ?').get(key);
    if (!row) return null;
    const age = Date.now() - new Date(row.fetched_at).getTime();
    if (age > CACHE_TTL) return null;
    return JSON.parse(row.data);
  } catch { return null; }
}

function setCache(key, data) {
  try {
    db.prepare('INSERT OR REPLACE INTO discogs_cache (cache_key, data) VALUES (?, ?)')
      .run(key, JSON.stringify(data));
  } catch { /* ignore cache write errors */ }
}

export async function searchDiscogs(query, type = 'release', page = 1) {
  const key = `search:${query}:${type}:${page}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(query)}&type=${type}&page=${page}&per_page=20`;
  const res = await fgFetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Discogs search failed: ${res.status}`);
  const data = await res.json();
  setCache(key, data);
  return data;
}

// Releases by UPC/EAN (Deezer and Beatport hand us one). Cached like a search.
export async function searchDiscogsBarcode(barcode) {
  const digits = String(barcode || '').replace(/\D/g, '');
  if (!digits) return { results: [] };
  const key = `barcode:${digits}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/database/search?barcode=${digits}&type=release&per_page=5`;
  const res = await fgFetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Discogs barcode search failed: ${res.status}`);
  const data = await res.json();
  setCache(key, data);
  return data;
}

// Bump when normaliseRelease gains a field, so cached releases stored in the
// older shape are refetched once instead of being served without it.
// 2 = per-track artists (2026-09-25). 3 = remixers, 4 = formats (2026-10-02).
const RELEASE_SHAPE_VERSION = 4;

// Remix/edit credits. A remix is often posted under the REMIXER's name
// ("Total M" on SoundCloud), while Discogs credits it to the original artist
// with the remixer only in extraartists ("DJ Total M — Remix").
const REMIX_ROLE = /remix|edit|re-?work|version/i;
const remixersOf = list => (list || [])
  .filter(a => REMIX_ROLE.test(a.role || ''))
  .map(a => ({ id: a.id, name: a.name.replace(/\s*\(\d+\)$/, '') }));

// background: the cover queue's own fetches don't count as site traffic.
export async function getRelease(releaseId, { background = false } = {}) {
  const key = `release:${releaseId}`;
  const cached = getCached(key);
  if (cached && cached._v >= RELEASE_SHAPE_VERSION) return cached;

  const url = `${DISCOGS_BASE}/releases/${releaseId}`;
  const res = await (background ? fetch : fgFetch)(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch release ${releaseId}: ${res.status}`);
  const data = normaliseRelease(await res.json());
  setCache(key, data);
  return data;
}

export async function getMaster(masterId, { background = false } = {}) {
  const key = `master:${masterId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/masters/${masterId}`;
  const res = await (background ? fetch : fgFetch)(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch master ${masterId}: ${res.status}`);
  const data = normaliseMaster(await res.json());
  setCache(key, data);
  return data;
}

// Artist/label photo & logo lookups — used by Feed.jsx's spotlight cards
// (artist headshot / label logo in place of the generic mark when Discogs
// has one). Same cache table/TTL as releases; profile photos and logos
// change rarely enough that 30 days is fine here too.

export async function getArtist(artistId) {
  const key = `artist:${artistId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/artists/${artistId}`;
  const res = await fgFetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch artist ${artistId}: ${res.status}`);
  const data = normaliseProfile(await res.json());
  setCache(key, data);
  return data;
}

export async function getLabel(labelId) {
  const key = `label:${labelId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/labels/${labelId}`;
  const res = await fgFetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch label ${labelId}: ${res.status}`);
  const data = normaliseProfile(await res.json());
  setCache(key, data);
  return data;
}

// Artist discography — added 2026-08-25 for the spotlight "unknown artist"
// backfill: when someone posts a single by an artist with no prior LNV
// posts, Feed.jsx's spotlight fills that artist's "Recent adds" slot with
// their real Discogs releases instead of (nonexistent) other community
// posts. Deliberately a SUMMARY list only (id/title/year/thumb, no
// tracklist or videos) — Discogs' own /artists/{id}/releases endpoint
// doesn't return that detail anyway, and fetching full detail for every
// release up front would multiply the request count for no reason. The
// frontend fetches one release's full detail (getRelease, above) lazily,
// only for whichever release the user actually clicks. Same cache
// table/TTL as everything else here — an artist's back catalogue doesn't
// change day to day.
export async function getArtistReleases(artistId, page = 1) {
  // v3 (2026-10-02): masters carry mainRelease, for getReleaseInfo.
  const key = `artist-releases:v3:${artistId}:${page}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/artists/${artistId}/releases?page=${page}&per_page=25&sort=year&sort_order=desc`;
  const res = await fgFetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch releases for artist ${artistId}: ${res.status}`);
  const data = normaliseArtistReleases(await res.json());
  setCache(key, data);
  return data;
}

// 2026-08-25 (spotlight discography, generalized pass) — same shape as
// getArtistReleases above, for labels. Discogs' /labels/{id}/releases has
// no year=desc sort param the way /artists/{id}/releases does, so results
// come back in Discogs' own catalogue order rather than newest-first.
export async function getLabelReleases(labelId, page = 1) {
  const key = `label-releases:v2:${labelId}:${page}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/labels/${labelId}/releases?page=${page}&per_page=25`;
  const res = await fgFetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch releases for label ${labelId}: ${res.status}`);
  const data = normaliseLabelReleases(await res.json());
  setCache(key, data);
  return data;
}

// Shared shape for both artists and labels — Discogs returns the same
// `images` array structure for each. Most artists/labels have none at all
// (the field is just absent), which is expected and handled by the caller
// (Feed.jsx falls back to the generic spotlight mark when imageUrl is null).
function normaliseProfile(data) {
  const images = data.images || [];
  const primary = images.find(i => i.type === 'primary') || images[0] || null;
  return {
    discogsId: data.id,
    name: data.name,
    profile: data.profile || null,
    imageUrl: primary?.uri150 || primary?.uri || null,
  };
}

// Discogs' /artists/{id}/releases returns a flat mix of "release" and
// "master" entries (a master groups pressings/reissues of the same release
// under one canonical id) — kept both rather than filtering, since a solo
// artist's discography is small enough that de-duplicating precisely isn't
// worth the risk of dropping something real. `role` (Main/Appearance/Remix/
// etc.) is passed through but not filtered on for the same reason — Discogs
// data is inconsistent enough that a "Main only" filter sometimes drops an
// artist's own releases that happen to be tagged oddly.
function normaliseArtistReleases(data) {
  return {
    pagination: {
      page: data.pagination?.page || 1,
      pages: data.pagination?.pages || 1,
      items: data.pagination?.items || 0,
    },
    // Discogs lists a release once PER ROLE (Producer + Appearance = two
    // rows, same id), which surfaced as duplicate React keys in the spotlight
    // grid. One entry per type+id, roles merged ("Producer, Appearance").
    releases: [...(data.releases || [])
      .filter(r => r.type === 'release' || r.type === 'master')
      .reduce((m, r) => {
        const k = `${r.type}:${r.id}`;
        const prev = m.get(k);
        if (prev) { if (r.role && !prev.role?.split(', ').includes(r.role)) prev.role = prev.role ? `${prev.role}, ${r.role}` : r.role; }
        else m.set(k, { id: r.id, type: r.type, title: r.title, year: r.year || null, role: r.role || null, thumb: r.thumb || null, artist: r.artist || null, label: r.label || null, format: r.format || null, mainRelease: r.main_release || null });
        return m;
      }, new Map()).values()],
  };
}

// Label releases endpoint has no `type` field the way artist releases do
// (a label's release list is always actual releases, never masters), so
// unlike normaliseArtistReleases this doesn't filter on type.
function normaliseLabelReleases(data) {
  return {
    pagination: {
      page: data.pagination?.page || 1,
      pages: data.pagination?.pages || 1,
      items: data.pagination?.items || 0,
    },
    releases: (data.releases || []).map(r => ({
      id: r.id,
      type: 'release',
      title: r.title,
      year: r.year || null,
      role: null,
      thumb: r.thumb || null,
      // Spotlight index columns (2026-09-25): who made it + catalogue number.
      artist: r.artist || null,
      catno: r.catno || null,
      format: r.format || null,
    })),
  };
}

function normaliseRelease(data) {
  return {
    discogsId: data.id,
    type: 'release',
    title: data.title,
    year: data.year,
    country: data.country,
    genres: data.genres || [],
    styles: data.styles || [],
    artists: (data.artists || []).map(a => ({ id: a.id, name: a.name.replace(/\s*\(\d+\)$/, '') })),
    labels: (data.labels || []).map(l => ({ id: l.id, name: l.name, catno: l.catno })),
    // "2xVinyl, LP, Album" — the spotlight list's type tag (LP/EP/Single…).
    formats: (data.formats || []).map(f => [f.qty > 1 ? `${f.qty}x${f.name}` : f.name, ...(f.descriptions || [])].join(', ')),
    // Per-track artists only exist on compilations ("Various" releases),
    // where they're the only record of who made each track.
    tracklist: (data.tracklist || []).map(t => ({
      position: t.position, title: t.title, duration: t.duration,
      artists: (t.artists || []).map(a => ({ id: a.id, name: a.name.replace(/\s*\(\d+\)$/, '') })),
      remixers: remixersOf(t.extraartists),
    })),
    // Release-level remix credits (they name their tracks in a.tracks).
    remixers: remixersOf(data.extraartists),
    coverImage: data.images?.[0]?.uri || null,
    thumbImage: data.thumb || null,
    _v: RELEASE_SHAPE_VERSION,
    videos: (data.videos || []).map(v => ({ url: v.uri, title: v.title })),
    notes: data.notes || null,
    discogsUrl: data.uri,
  };
}

function normaliseMaster(data) {
  return {
    discogsId: data.id,
    type: 'master',
    title: data.title,
    year: data.year,
    genres: data.genres || [],
    styles: data.styles || [],
    artists: (data.artists || []).map(a => ({ id: a.id, name: a.name.replace(/\s*\(\d+\)$/, '') })),
    tracklist: (data.tracklist || []).map(t => ({ position: t.position, title: t.title, duration: t.duration })),
    coverImage: data.images?.[0]?.uri || null,
    thumbImage: data.images?.[0]?.uri150 || null,
    videos: (data.videos || []).map(v => ({ url: v.uri, title: v.title })),
    discogsUrl: data.uri,
  };
}

// ─── Any Discogs URL -> release id ────────────────────────────────────────────
// Compose used to accept only /release/<id> links, so a shop listing
// (/shop/item/<id>, /sell/item/<id>) or a master page hit a "not a valid
// release URL" wall. This does the extra hop instead:
//   /release/<id>, /sell/release/<id>, ?release_id=<id>  -> that release
//   /shop/item/<id>, /sell/item/<id>                     -> the listing's release (1 call)
//   /master/<id>, ?master_id=<id>                        -> the master's main release (1 call)
// Locale prefixes (/de/, /fr/...) and slugs after the id are fine.
// Mapping results are cached: a release/master pairing never changes, and a
// listing's release doesn't either (the listing just disappears when sold).
export async function resolveDiscogsUrl(url) {
  const u = String(url || '');
  const release = u.match(/\/release\/(\d+)/)?.[1] || u.match(/[?&]release_id=(\d+)/)?.[1];
  if (release) return { releaseId: Number(release), via: 'release' };

  const listing = u.match(/\/(?:shop|sell)\/item\/(\d+)/)?.[1];
  if (listing) {
    const key = `listing:${listing}`;
    const cached = getCached(key);
    if (cached) return cached;
    const res = await fgFetch(`${DISCOGS_BASE}/marketplace/listings/${listing}`, { headers: getHeaders() });
    if (res.status === 404) throw new Error('That Discogs listing has been sold or removed — paste the release page instead');
    if (!res.ok) throw new Error(`Discogs listing ${listing}: ${res.status}`);
    const data = await res.json();
    if (!data.release?.id) throw new Error(`Discogs listing ${listing} has no release`);
    const out = { releaseId: data.release.id, via: 'listing' };
    setCache(key, out);
    return out;
  }

  const master = u.match(/\/master\/(\d+)/)?.[1] || u.match(/[?&]master_id=(\d+)/)?.[1];
  if (master) {
    const key = `master-main:${master}`;
    const cached = getCached(key);
    if (cached) return cached;
    const res = await fgFetch(`${DISCOGS_BASE}/masters/${master}`, { headers: getHeaders() });
    if (!res.ok) throw new Error(`Discogs master ${master}: ${res.status}`);
    const data = await res.json();
    if (!data.main_release) throw new Error(`Discogs master ${master} has no main release`);
    const out = { releaseId: data.main_release, via: 'master' };
    setCache(key, out);
    return out;
  }

  throw new Error('Paste a Discogs release, master or shop link');
}

// ─── Catalogue crawler (labels and artists) ──────────────────────────────────
// gabriel, 2026-10-02: a spotlight showed Discogs' first 25 releases of a
// label or artist, whatever the size of the catalogue. Like the YouTube
// channel crawler, every page (100 per request) is now collected into
// discogs_catalogue in the background, one request every CATALOGUE_GAP_MS
// (with the cover queue's ~30/min that stays under Discogs' 60/min), and
// served from there in pages, newest year first, searchable. A crawl stopped
// by a restart or a 429 resumes at next_page; a finished one is redone
// monthly to pick up new releases.

const CATALOGUE_GAP_MS = 3000;
const CATALOGUE_QUIET_MS = 4000;
const CATALOGUE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const catalogueCrawling = new Set();

const crawlRow = (kind, id) => db.prepare('SELECT * FROM discogs_catalogue_crawl WHERE kind = ? AND entity_id = ?').get(kind, id);
const catalogueCount = (kind, id) => db.prepare('SELECT COUNT(*) c FROM discogs_catalogue WHERE kind = ? AND entity_id = ?').get(kind, id).c;

// One page from Discogs into discogs_catalogue. -> { pages, items } | null on 429.
async function crawlCataloguePage(kind, id, page) {
  const url = kind === 'artist'
    ? `${DISCOGS_BASE}/artists/${id}/releases?page=${page}&per_page=100&sort=year&sort_order=desc`
    : `${DISCOGS_BASE}/labels/${id}/releases?page=${page}&per_page=100`;
  const res = await fetch(url, { headers: getHeaders() }); // background: not fgFetch
  if (res.status === 429) return null;
  if (!res.ok) throw new Error(`Discogs ${kind} ${id} releases page ${page}: ${res.status}`);
  const data = await res.json();
  const get = db.prepare('SELECT role FROM discogs_catalogue WHERE kind = ? AND entity_id = ? AND item_type = ? AND item_id = ?');
  const put = db.prepare(`INSERT OR REPLACE INTO discogs_catalogue
    (kind, entity_id, item_type, item_id, title, year, role, thumb, artist, label, format, catno, main_release)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    for (const r of data.releases || []) {
      // Label lists carry no type (they're all releases); artist lists mix in masters.
      const type = r.type || 'release';
      if (type !== 'release' && type !== 'master') continue;
      // Discogs lists a release once per role: merge them ("Producer, Appearance").
      const prev = get.get(kind, id, type, r.id)?.role || '';
      const roles = [...new Set([...prev.split(', '), r.role || ''].filter(Boolean))].join(', ') || null;
      put.run(kind, id, type, r.id, r.title || '', r.year || null, roles, r.thumb || null,
        r.artist || null, r.label || null, r.format || null, r.catno || null, r.main_release || null);
    }
  })();
  return { pages: data.pagination?.pages || 1, items: data.pagination?.items || 0 };
}

// ONE worker for every catalogue being crawled, taking turns a page at a
// time (round robin): requests stay at one per CATALOGUE_GAP_MS however many
// spotlights are open, a 9-release label finishes at once, and a giant
// (Columbia: ~396k releases, ~4,000 pages ≈ 3h) keeps going in the background
// without starving the others.
const catalogueQueue = [];   // 'kind:id' keys still collecting, in turn order
let catalogueWorking = false;

function crawlCatalogue(kind, id) {
  const key = `${kind}:${id}`;
  let row = crawlRow(kind, id);
  if (row?.done && Date.now() - new Date(`${row.crawled_at}Z`).getTime() > CATALOGUE_REFRESH_MS) {
    db.prepare('UPDATE discogs_catalogue_crawl SET next_page = 1, done = 0 WHERE kind = ? AND entity_id = ?').run(kind, id);
    row = crawlRow(kind, id);
  }
  if (!row || row.done || catalogueQueue.includes(key)) return;
  catalogueQueue.push(key);
  catalogueCrawling.add(key);
  drainCatalogues();
}

async function drainCatalogues() {
  if (catalogueWorking) return;
  catalogueWorking = true;
  try {
    while (catalogueQueue.length) {
      const key = catalogueQueue.shift();
      const [kind, idStr] = key.split(':');
      const id = Number(idStr);
      // Wait for a quiet moment: people using the site go first.
      while (Date.now() - lastForeground < CATALOGUE_QUIET_MS) await new Promise(r => setTimeout(r, 1000));
      const row = crawlRow(kind, id);
      if (!row || row.done) { catalogueCrawling.delete(key); continue; }
      try {
        const page = await crawlCataloguePage(kind, id, row.next_page);
        if (!page) {
          // 429: everyone waits a minute; this one keeps its turn.
          catalogueQueue.unshift(key);
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        const done = row.next_page >= page.pages ? 1 : 0;
        db.prepare(`UPDATE discogs_catalogue_crawl SET total = ?, pages = ?, next_page = ?, done = ?, crawled_at = datetime('now')
                    WHERE kind = ? AND entity_id = ?`).run(page.items, page.pages, done ? row.next_page : row.next_page + 1, done, kind, id);
        if (done) catalogueCrawling.delete(key);
        else catalogueQueue.push(key); // back of the line
      } catch (err) {
        console.error('[catalogue crawl]', key, err.message);
        logEvent('error', 'crawl', `Discogs catalogue ${key}: ${err.message}`);
        catalogueCrawling.delete(key); // retried next time it's asked for
      }
      await new Promise(r => setTimeout(r, CATALOGUE_GAP_MS));
    }
  } finally {
    catalogueWorking = false;
  }
}

/**
 * Keeps every catalogue LNV knows about filling, without being asked:
 * at startup and then hourly, queue (a) crawls a restart interrupted,
 * (b) every artist and label posted with a Discogs id that has never been
 * crawled, (c) finished ones due their monthly refresh. The queue itself
 * paces the requests and waits for quiet moments.
 */
export function startCatalogueKeeper() {
  const sweep = () => {
    try {
      const ins = db.prepare('INSERT OR IGNORE INTO discogs_catalogue_crawl (kind, entity_id) VALUES (?, ?)');
      // 194 = Discogs' "Various" (every compilation) — not an artist to crawl.
      for (const { id } of db.prepare("SELECT DISTINCT discogs_artist_id id FROM post_artists WHERE discogs_artist_id IS NOT NULL AND discogs_artist_id != 194 AND lower(artist_name) NOT IN ('various', 'various artists')").all()) ins.run('artist', id);
      db.prepare("DELETE FROM discogs_catalogue_crawl WHERE kind = 'artist' AND entity_id = 194").run();
      for (const { id } of db.prepare('SELECT DISTINCT discogs_label_id id FROM post_labels WHERE discogs_label_id IS NOT NULL').all()) ins.run('label', id);
      for (const r of db.prepare('SELECT kind, entity_id FROM discogs_catalogue_crawl').all()) crawlCatalogue(r.kind, r.entity_id);
    } catch (err) {
      console.error('[catalogue keeper]', err.message);
      logEvent('error', 'crawl', `Catalogue keeper: ${err.message}`);
    }
  };
  setTimeout(sweep, 15000);
  setInterval(sweep, 60 * 60 * 1000);
}

/**
 * Releases already collected whose title contains `title` — the DB-first
 * step of a Discogs lookup (media.js tryDiscogsLookup), before any search
 * call. A master's row points at its main release.
 */
export function catalogueCandidates(title, limit = 25) {
  const term = String(title || '').trim().toLowerCase();
  if (term.length < 2) return [];
  return db.prepare(`SELECT DISTINCT item_type, item_id, main_release, title, artist FROM discogs_catalogue
                     WHERE instr(lower(title), ?) > 0 LIMIT ?`).all(term, limit)
    .map(r => ({ releaseId: r.item_type === 'master' ? r.main_release : r.item_id, title: r.title, artist: r.artist }))
    .filter(r => r.releaseId);
}

/**
 * A page of a label's or artist's whole Discogs catalogue, newest year
 * first, optionally filtered (title, artist, catno). Starts or resumes the
 * crawl in the background; the first call waits for page 1 so the card
 * isn't empty. Same row shape as getArtistReleases/getLabelReleases, plus
 * `crawl` progress.
 */
export async function getCataloguePage(kind, id, { offset = 0, limit = 100, q = '' } = {}) {
  if (!crawlRow(kind, id)) db.prepare('INSERT OR IGNORE INTO discogs_catalogue_crawl (kind, entity_id) VALUES (?, ?)').run(kind, id);
  if (catalogueCount(kind, id) === 0 && !catalogueCrawling.has(`${kind}:${id}`)) {
    const page = await crawlCataloguePage(kind, id, 1);
    if (page) {
      const done = page.pages <= 1 ? 1 : 0;
      db.prepare(`UPDATE discogs_catalogue_crawl SET total = ?, pages = ?, next_page = ?, done = ?, crawled_at = datetime('now')
                  WHERE kind = ? AND entity_id = ?`).run(page.items, page.pages, done ? 1 : 2, done, kind, id);
    }
  }
  crawlCatalogue(kind, id); // not awaited

  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const term = String(q || '').trim().toLowerCase();
  const where = term
    ? "kind = ? AND entity_id = ? AND instr(lower(title || ' ' || ifnull(artist, '') || ' ' || ifnull(catno, '')), ?) > 0"
    : 'kind = ? AND entity_id = ?';
  const args = term ? [kind, id, term] : [kind, id];
  const matched = db.prepare(`SELECT COUNT(*) c FROM discogs_catalogue WHERE ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM discogs_catalogue WHERE ${where} ORDER BY (year IS NULL), year DESC, title LIMIT ? OFFSET ?`).all(...args, lim, off);
  const crawl = crawlRow(kind, id);
  const have = catalogueCount(kind, id);

  return {
    releases: rows.map(r => ({
      id: r.item_id, type: r.item_type, title: r.title, year: r.year, role: r.role, thumb: r.thumb,
      artist: r.artist, label: r.label, format: r.format, catno: r.catno, mainRelease: r.main_release,
    })),
    // items = Discogs' own count (it counts a release once per role).
    pagination: { items: crawl?.total || have, offset: off, limit: lim, matched },
    crawl: { have, total: crawl?.total || have, done: !!crawl?.done, running: catalogueCrawling.has(`${kind}:${id}`) },
  };
}

// ─── Full-size covers for catalogue lists ─────────────────────────────────────
// Discogs' release LISTS (artist/label discographies) only carry a 150px
// thumb, and its image URLs are signed, so a bigger size can't be requested
// by editing the URL. The full-size cover comes with each release's own
// detail — one call per release. getCovers answers from the cache at once
// and queues whatever's missing, fetched one every COVER_GAP_MS (≈30/min,
// leaving headroom under Discogs' 60/min for everything else). Each fetch
// lands in discogs_cache via getRelease/getMaster, so a cover is fetched
// once, ever. Keys: 'release:<id>' / 'master:<id>'.
const COVER_GAP_MS = 2000;
const coverQueue = [];
const coverQueued = new Set();
let coverWorking = false;

function cachedCover(key) {
  const hit = getCached(key);
  if (!hit) return undefined;           // not fetched yet
  return hit.coverImage || null;        // fetched; null = Discogs has no image
}

async function drainCovers() {
  if (coverWorking) return;
  coverWorking = true;
  try {
    while (coverQueue.length) {
      const key = coverQueue.shift();
      coverQueued.delete(key);
      if (cachedCover(key) !== undefined && (key.startsWith('master:') || getCached(key)?._v >= RELEASE_SHAPE_VERSION)) continue;
      const [kind, id] = key.split(':');
      try {
        if (kind === 'master') await getMaster(Number(id), { background: true });
        else await getRelease(Number(id), { background: true });
      } catch { /* leave it; it'll be re-queued next time it's asked for */ }
      await new Promise(r => setTimeout(r, COVER_GAP_MS));
    }
  } finally {
    coverWorking = false;
  }
}

// Format / label / catno for releases a catalogue list has no detail for —
// an artist's MASTER entries (Discogs lists them bare; their main release
// has the detail). Same cache + slow queue as the covers above, so it costs
// one release fetch per master, ever. ids = release ids (a master's
// mainRelease). -> { info: { [id]: { format, label, catno } }, pending }
export function getReleaseInfo(ids = []) {
  const info = {};
  let pending = 0;
  for (const id of ids) {
    if (!/^\d+$/.test(String(id))) continue;
    const key = `release:${id}`;
    const hit = getCached(key);
    if (hit && hit._v >= RELEASE_SHAPE_VERSION) {
      const l = hit.labels?.[0];
      info[id] = {
        format: (hit.formats || []).join(' + '),
        label: [...new Set((hit.labels || []).map(x => x.name))].join(', '),
        catno: l?.catno && !/^none$/i.test(l.catno) ? l.catno : '',
      };
      continue;
    }
    pending++;
    if (!coverQueued.has(key)) { coverQueued.add(key); coverQueue.push(key); }
  }
  if (pending) drainCovers();
  return { info, pending };
}

export function getCovers(keys = []) {
  const covers = {};
  let pending = 0;
  for (const key of keys) {
    if (!/^(release|master):\d+$/.test(key)) continue;
    const c = cachedCover(key);
    if (c !== undefined) { covers[key] = c; continue; }
    pending++;
    if (!coverQueued.has(key)) { coverQueued.add(key); coverQueue.push(key); }
  }
  if (pending) drainCovers();
  return { covers, pending };
}
