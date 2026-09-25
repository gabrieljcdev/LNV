import fetch from 'node-fetch';
import dotenv from 'dotenv';
import db from '../db/database.js';
dotenv.config();

const DISCOGS_BASE = 'https://api.discogs.com';
// Discogs releases never change — cache forever (30 days TTL is generous)
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

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
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Discogs search failed: ${res.status}`);
  const data = await res.json();
  setCache(key, data);
  return data;
}

// Bump when normaliseRelease gains a field, so cached releases stored in the
// older shape are refetched once instead of being served without it.
// 2 = per-track artists (2026-09-25).
const RELEASE_SHAPE_VERSION = 2;

export async function getRelease(releaseId) {
  const key = `release:${releaseId}`;
  const cached = getCached(key);
  if (cached && cached._v >= RELEASE_SHAPE_VERSION) return cached;

  const url = `${DISCOGS_BASE}/releases/${releaseId}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch release ${releaseId}: ${res.status}`);
  const data = normaliseRelease(await res.json());
  setCache(key, data);
  return data;
}

export async function getMaster(masterId) {
  const key = `master:${masterId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/masters/${masterId}`;
  const res = await fetch(url, { headers: getHeaders() });
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
  const res = await fetch(url, { headers: getHeaders() });
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
  const res = await fetch(url, { headers: getHeaders() });
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
  const key = `artist-releases:${artistId}:${page}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/artists/${artistId}/releases?page=${page}&per_page=25&sort=year&sort_order=desc`;
  const res = await fetch(url, { headers: getHeaders() });
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
  const key = `label-releases:${labelId}:${page}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${DISCOGS_BASE}/labels/${labelId}/releases?page=${page}&per_page=25`;
  const res = await fetch(url, { headers: getHeaders() });
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
        else m.set(k, { id: r.id, type: r.type, title: r.title, year: r.year || null, role: r.role || null, thumb: r.thumb || null });
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
    // Per-track artists only exist on compilations ("Various" releases),
    // where they're the only record of who made each track.
    tracklist: (data.tracklist || []).map(t => ({
      position: t.position, title: t.title, duration: t.duration,
      artists: (t.artists || []).map(a => ({ id: a.id, name: a.name.replace(/\s*\(\d+\)$/, '') })),
    })),
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
    const res = await fetch(`${DISCOGS_BASE}/marketplace/listings/${listing}`, { headers: getHeaders() });
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
    const res = await fetch(`${DISCOGS_BASE}/masters/${master}`, { headers: getHeaders() });
    if (!res.ok) throw new Error(`Discogs master ${master}: ${res.status}`);
    const data = await res.json();
    if (!data.main_release) throw new Error(`Discogs master ${master} has no main release`);
    const out = { releaseId: data.main_release, via: 'master' };
    setCache(key, out);
    return out;
  }

  throw new Error('Paste a Discogs release, master or shop link');
}
