// Spotify Web API (2026-10-06). App credentials only (SPOTIFY_CLIENT_ID /
// SPOTIFY_CLIENT_SECRET in backend/.env — the "client credentials" flow:
// no user logs in, so only public catalogue data). Used by the Spotify link
// resolver (routes/media.js resolveSpotify) for an album's tracklist, label,
// release date and — the big one — its barcode (UPC), which finds the exact
// Discogs release far more reliably than matching names.
//
// Spotify leaves the label, popularity and artist genres out for new apps
// (checked 2026-10-06), so the label comes from the ℗/© lines as before.
//
// Answers are cached 30 days (spotify_cache). On a 429 Spotify says how
// long to wait (Retry-After); calls fail fast until then, and the resolver
// falls back to reading the public page as before.

import fetch from 'node-fetch';
import db from '../db/database.js';
import { countCall } from './usageService.js';
import { coreTitle, trackKey } from './youtubeService.js';

db.exec(`CREATE TABLE IF NOT EXISTS spotify_cache (
  cache_key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  fetched_at TEXT DEFAULT (datetime('now'))
)`);

const CACHE_DAYS = 30;
export const spotifyConfigured = () => !!(process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_SECRET?.trim());

let token = null, tokenUntil = 0, pausedUntil = 0;

async function getToken() {
  if (token && Date.now() < tokenUntil) return token;
  countCall('spotify');
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID.trim()}:${process.env.SPOTIFY_CLIENT_SECRET.trim()}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Spotify sign-in failed (${res.status}${data.error ? `: ${data.error}` : ''})`);
  token = data.access_token;
  tokenUntil = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
  return token;
}

async function api(path) {
  if (!spotifyConfigured()) throw new Error('Spotify keys are not set');
  if (Date.now() < pausedUntil) throw new Error('Spotify asked us to wait');
  const cached = db.prepare(`SELECT data FROM spotify_cache WHERE cache_key = ? AND fetched_at > datetime('now', ?)`).get(path, `-${CACHE_DAYS} days`);
  if (cached) return JSON.parse(cached.data);
  countCall('spotify');
  let res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
  if (res.status === 401) { token = null; res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${await getToken()}` } }); }
  if (res.status === 429) {
    pausedUntil = Date.now() + (Number(res.headers.get('retry-after')) || 30) * 1000;
    throw new Error('Spotify rate limit — waiting');
  }
  if (!res.ok) throw new Error(`Spotify ${path.split('?')[0]}: ${res.status}`);
  const data = await res.json();
  db.prepare('INSERT OR REPLACE INTO spotify_cache (cache_key, data, fetched_at) VALUES (?, ?, datetime(\'now\'))').run(path, JSON.stringify(data));
  return data;
}

const clock = ms => { const s = Math.round((ms || 0) / 1000); return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''; };

// An album: name, type (album / single / compilation), year, label, UPC,
// artists, cover, and every track (disc-track positions on multi-disc sets).
export async function spotifyAlbum(id) {
  const a = await api(`/albums/${encodeURIComponent(id)}`);
  let items = a.tracks?.items || [];
  for (let next = a.tracks?.next; next && items.length < 500;) {
    const page = await api(next.replace('https://api.spotify.com/v1', ''));
    items = items.concat(page.items || []);
    next = page.next;
  }
  const discs = new Set(items.map(t => t.disc_number)).size;
  return {
    id: a.id,
    name: a.name || '',
    type: a.album_type || '',
    year: (a.release_date || '').slice(0, 4),
    label: a.label || '',
    copyrights: (a.copyrights || []).map(c => c.text).filter(Boolean),
    upc: a.external_ids?.upc || '',
    artists: (a.artists || []).map(x => ({ id: x.id, name: x.name })),
    cover: a.images?.[0]?.url || null,
    tracks: items.map(t => ({
      id: t.id,
      position: discs > 1 ? `${t.disc_number}-${t.track_number}` : String(t.track_number),
      title: t.name || '',
      duration: clock(t.duration_ms),
      artists: (t.artists || []).map(x => ({ name: x.name })),
    })),
  };
}

// A track: name, artists, ISRC, duration, and the album it's on.
export async function spotifyTrack(id) {
  const t = await api(`/tracks/${encodeURIComponent(id)}`);
  return {
    id: t.id,
    name: t.name || '',
    artists: (t.artists || []).map(x => ({ id: x.id, name: x.name })),
    isrc: t.external_ids?.isrc || '',
    duration: clock(t.duration_ms),
    albumId: t.album?.id || null,
  };
}

// ── Search (2026-10-06) ───────────────────────────────────────────────────────
// Finding the same record on Spotify from a link on another platform — for
// its barcode (Discogs' most exact match) and, when YouTube's daily budget
// is nearly spent, as a player. A result only counts when both the artist
// and the title agree with what was asked for.
const squash = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*[([].*?(remaster|deluxe|edition|version|mix|edit)[^)\]]*[)\]]/g, '').replace(/&/g, ' and ').replace(/\bvolume\b/g, 'vol').replace(/\bpart\b/g, 'pt').replace(/[^a-z0-9]+/g, '');
const agrees = (a, b) => { const x = squash(a), y = squash(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))); };
const artistAgrees = (want, artists) => !want || artists.some(n => agrees(want, n) || String(want).toLowerCase().split(/\s*(?:,|&|\band\b|\bfeat\.?|\bx\b)\s*/).some(w => w && agrees(w, n)));

// What a title says beyond the song's name — "Dixon Rework", "Deep Cover 98".
// "(Original Mix)" / "(feat. X)" are already gone (coreTitle); remaster and
// year labels are ignored too. Two titles name the same recording only when
// these agree: "Track (Dub Remix)" must not match plain "Track".
const IGNORED_TAG = new Set(['remaster', 'remastered', 'mono', 'stereo', 'deluxe', 'edition', 'bonus', 'track']);
const versionTag = t => trackKey((coreTitle(t).split(/\s*[(\[]|\s-\s/).slice(1).join(' ')))
  .split(' ').filter(w => w && !IGNORED_TAG.has(w) && !/^(19|20)\d\d$/.test(w)).join(' ');
const sameVersion = (a, b) => versionTag(a) === versionTag(b);

export async function spotifySearchTrack(artist, title) {
  if (!title) return null;
  const q = [`track:${title}`, artist ? `artist:${String(artist).split(/,|&/)[0].trim()}` : ''].filter(Boolean).join(' ');
  const d = await api(`/search?type=track&limit=5&q=${encodeURIComponent(q)}`);
  const t = (d.tracks?.items || []).find(x => agrees(title, x.name) && sameVersion(title, x.name) && artistAgrees(artist, (x.artists || []).map(a => a.name)));
  return t ? { id: t.id, name: t.name, artists: t.artists.map(a => a.name), albumId: t.album?.id || null, url: `https://open.spotify.com/track/${t.id}` } : null;
}

export async function spotifySearchAlbum(artist, title) {
  if (!title) return null;
  const main = String(artist || '').split(/,|&/)[0].trim();
  // The precise field query first; Spotify's field filters are literal ("Volume 1"
  // finds nothing when the album is "Vol. 1"), so then a plain one. Either way a
  // result only counts when the title AND artist agree.
  // Spotify matches every word: "Volume 1" finds nothing when the album is
  // "Vol. 1", so a third try leaves the volume / part number out (agreement is
  // still checked on the full title, where volume = vol).
  const bare = String(title).replace(/[,\s]*\b(?:vol(?:ume)?|part|pt)\.?\s*\d+\b/i, '').trim();
  const queries = [[`album:${title}`, main ? `artist:${main}` : ''], [main, title], bare && bare !== title ? [main, bare] : null]
    .filter(Boolean).map(parts => parts.filter(Boolean).join(' '));
  for (const q of queries) {
    const d = await api(`/search?type=album&limit=5&q=${encodeURIComponent(q)}`);
    const a = (d.albums?.items || []).find(x => agrees(title, x.name) && artistAgrees(artist, (x.artists || []).map(y => y.name)));
    if (a) return { id: a.id, name: a.name };
  }
  return null;
}

// A whole release in one go (2026-10-07): find its album on Spotify, then
// match the Discogs tracks to the album's tracks by title (the same core
// title the YouTube lookup uses: "(Original Mix)" / "(feat. X)" ignored,
// remixes and parts NOT). Two or three free calls instead of one search per
// track. -> { albumId, albumName, links: { [discogs position]: { url, title } }, total } | null.
export async function spotifyAlbumLinks({ artist = '', album = '', tracks = [] } = {}) {
  if (!artist || !album || !tracks.length) return null;
  const hit = await spotifySearchAlbum(artist, album);
  if (!hit) return null;
  const alb = await spotifyAlbum(hit.id);
  // Spotify often joins a side's tracks into one title ("Flotation Device /
  // Fear or Laziness?"): a Discogs title may match the whole or one half.
  const pool = alb.tracks.map(t => ({ ...t, keys: [trackKey(coreTitle(t.title)), ...(t.title.includes(' / ') ? t.title.split(' / ').map(x => trackKey(coreTitle(x))) : [])].filter(Boolean), used: false }));
  const links = {};
  for (const t of tracks) {
    const key = trackKey(coreTitle(t.title));
    // a whole-title match is preferred over a half-title one
    const m = key && (pool.find(p => !p.used && p.keys[0] === key) || pool.find(p => !p.used && p.keys.includes(key)));   // in order, so two "Intro"s pair off
    if (!m) continue;
    m.used = true;
    links[t.key ?? t.position] = { url: `https://open.spotify.com/track/${m.id}`, title: `${m.artists.map(a => a.name).join(', ')} – ${m.title}` };
  }
  return { albumId: hit.id, albumName: alb.name, links, total: tracks.length };
}

// The barcode of the record a track or release title belongs to, or ''.
export async function spotifyBarcodeFor({ artist = '', title = '', album = '', kind = 'track' } = {}) {
  if (!spotifyConfigured() || !artist) return '';
  try {
    let albumId = null;
    if (album || kind === 'album') albumId = (await spotifySearchAlbum(artist, album || title))?.id || null;
    if (!albumId && kind !== 'album') albumId = (await spotifySearchTrack(artist, title))?.albumId || null;
    return albumId ? (await spotifyAlbum(albumId)).upc || '' : '';
  } catch { return ''; }
}
