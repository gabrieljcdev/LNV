// Last.fm (2026-10-06): listeners' tags as genres when Discogs has none —
// instead of the default "Electronic". Needs LASTFM_API_KEY in backend/.env
// (last.fm/api/account/create); without it everything here quietly returns
// nothing. Answers cached 30 days (lastfm_cache); requests counted for
// Admin → Status (usageService).

import fetch from 'node-fetch';
import db from '../db/database.js';
import { countCall } from './usageService.js';

db.exec(`CREATE TABLE IF NOT EXISTS lastfm_cache (
  cache_key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  fetched_at TEXT DEFAULT (datetime('now'))
)`);

export const lastfmConfigured = () => !!process.env.LASTFM_API_KEY?.trim();
let pausedUntil = 0;

async function call(params) {
  const qs = new URLSearchParams({ ...params, api_key: process.env.LASTFM_API_KEY.trim(), format: 'json', autocorrect: '1' });
  const key = JSON.stringify(params);
  const cached = db.prepare(`SELECT data FROM lastfm_cache WHERE cache_key = ? AND fetched_at > datetime('now', '-30 days')`).get(key);
  if (cached) return JSON.parse(cached.data);
  if (Date.now() < pausedUntil) return null;
  countCall('lastfm');
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${qs}`, { headers: { 'User-Agent': 'LateNightVibes/1.0' } });
  if (res.status === 429) { pausedUntil = Date.now() + 60_000; return null; }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) return null; // not found, bad key… nothing to keep
  db.prepare('INSERT OR REPLACE INTO lastfm_cache (cache_key, data, fetched_at) VALUES (?, ?, datetime(\'now\'))').run(key, JSON.stringify(data));
  return data;
}

// Tags that aren't genres.
const NOT_GENRES = /^(seen live|favou?rites?|my |albums? i own|beautiful|awesome|love|best|amazing|cool|chill(ed)?|under \d+|\d{2,4}s?|[a-z]{2,3}$|british|uk|usa|american|german|french|japanese|italian|japan|germany|france|italy|spain|brazil|brazilian|nigeria|nigerian|ghana|london|detroit|chicago|berlin|paris|tokyo|new york|canada|canadian|australia|australian|dutch|netherlands|belgian|belgium|swedish|sweden|norway|norwegian|finland|finnish|danish|russian|russia|south africa|south african|jamaica|jamaican|cuba|cuban|male vocalists?|female vocalists?)/i;
const tidy = t => t.replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAnd\b/g, 'and');

function pick(data, field) {
  const tags = data?.[field]?.tag || [];
  return (Array.isArray(tags) ? tags : [tags])
    .filter(t => t?.name && Number(t.count ?? 100) >= 10 && !NOT_GENRES.test(t.name))
    .slice(0, 4)
    .map(t => tidy(t.name));
}

// Up to 4 genres for a record: the album's tags, else the track's, else the
// artist's. [] when there's no key or nothing useful.
export async function lastfmGenres({ artist = '', album = '', track = '' } = {}) {
  if (!lastfmConfigured() || !artist) return [];
  const main = String(artist).split(/\s*(?:,|&|\bfeat\.?\b)\s*/i)[0];
  try {
    if (album) { const g = pick(await call({ method: 'album.gettoptags', artist: main, album }), 'toptags'); if (g.length) return g; }
    if (track) { const g = pick(await call({ method: 'track.gettoptags', artist: main, track }), 'toptags'); if (g.length) return g; }
    return pick(await call({ method: 'artist.gettoptags', artist: main }), 'toptags');
  } catch { return []; }
}
