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

export async function getRelease(releaseId) {
  const key = `release:${releaseId}`;
  const cached = getCached(key);
  if (cached) return cached;

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
    tracklist: (data.tracklist || []).map(t => ({ position: t.position, title: t.title, duration: t.duration })),
    coverImage: data.images?.[0]?.uri || null,
    thumbImage: data.thumb || null,
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
