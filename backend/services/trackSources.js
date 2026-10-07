// Every place a track can be played (2026-10-07, gabriel: "find everything we
// can for free in the background … store those links … on post, which embeds
// are available and which you'd like to use"). A track used to hold ONE link;
// track_sources holds one per platform, so a listener (or the poster) can pick.
//
// Free finders, none of which touch the YouTube quota:
//   spotify      Web API search (keys in .env; cached 30 days by spotifyService)
//   deezer       public search API, no key
//   apple        iTunes Search API, no key
//   musicbrainz  recording → url relationships (YouTube / SoundCloud / Bandcamp
//                links people have filed). 1 request a second, queued.
// A result is kept only when its real title and artist agree with the track
// (linkVerdict, the same test links people paste go through) — never on a
// search hit alone. YouTube itself stays the last resort (routes/discogs.js).
//
// New posts only: queuePostSources(postId) runs once, in the background, a few
// seconds after a post is saved. Nothing here ever overwrites a stored link.

import fetch from 'node-fetch';
import db from '../db/database.js';
import { countCall } from './usageService.js';
import { spotifyConfigured, spotifySearchTrack } from './spotifyService.js';
import { trackKey, coreTitle } from './youtubeService.js';
import { logEvent } from './logService.js';
import { linkKeysOf } from './releaseSpotify.js';

db.exec(`CREATE TABLE IF NOT EXISTS track_sources (
  track_id INTEGER NOT NULL,         -- post_tracks.id
  platform TEXT NOT NULL,            -- youtube | soundcloud | bandcamp | spotify | deezer | apple
  url TEXT NOT NULL,
  title TEXT,                        -- what that service calls the track
  source TEXT,                       -- how we found it (post, spotify-search, deezer-search, apple-search, musicbrainz)
  found_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (track_id, platform)
)`);
try { db.exec('ALTER TABLE post_tracks ADD COLUMN sources_checked_at TEXT'); } catch { /* already there */ }

// Best first. `full`: plays the whole track for everyone (the others are
// 30-second previews unless the listener is signed in to that service).
export const PLATFORMS = {
  youtube:    { rank: 0, full: true },
  soundcloud: { rank: 1, full: true },
  bandcamp:   { rank: 2, full: true },
  spotify:    { rank: 3, full: false },
  deezer:     { rank: 4, full: false },
  apple:      { rank: 5, full: false },
};
const PLATFORM_URLS = [
  ['youtube', /youtube\.com|youtu\.be/i], ['soundcloud', /soundcloud\.com/i], ['bandcamp', /bandcamp\.com/i],
  ['spotify', /open\.spotify\.com/i], ['deezer', /deezer\.com/i], ['apple', /music\.apple\.com/i],
];
export const platformOfUrl = url => PLATFORM_URLS.find(([, re]) => re.test(url || ''))?.[0] || null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'LateNightVibes/1.0 ( https://latenightvibes.example )';

// ── finders: each -> { platform, url, title } | null ────────────────────────
const firstArtist = a => String(a || '').split(/\s*,\s*|\s*&\s*/)[0].trim();
// Strict on purpose: a search hit counts only when the TITLE is the same song
// (a "(feat. …)" tail is fine, a remix or live version is not) and the artist
// names overlap. A loose test took "Fresh New Life" by someone else for
// "New Life" by Fresh & Low.
function agree(artist, title, gotArtist, gotTitle) {
  const tt = trackKey(coreTitle(title)), gt = trackKey(coreTitle(gotTitle));
  const want = trackKey(firstArtist(artist)), got = trackKey(gotArtist);
  if (!tt || !gt || !want || !got) return false;
  // trackKey leaves only letters, digits and spaces, so a plain prefix test is safe
  const titleOk = gt === tt || /^(?:feat|ft|featuring|with) /.test(gt.startsWith(tt + ' ') ? gt.slice(tt.length + 1) : '');
  return titleOk && (got.includes(want) || want.includes(got));
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

async function findSpotify(artist, title) {
  if (!spotifyConfigured()) return null;
  const s = await spotifySearchTrack(artist, title).catch(() => null);
  return s && { platform: 'spotify', url: s.url, title: `${s.artists.join(', ')} – ${s.name}` };
}

async function findDeezer(artist, title) {
  countCall('deezer');
  const d = await getJson(`https://api.deezer.com/search/track?limit=8&q=${encodeURIComponent(`${firstArtist(artist)} ${title}`)}`);
  const t = (d.data || []).find(x => agree(artist, title, x.artist?.name, x.title));
  return t && { platform: 'deezer', url: `https://www.deezer.com/track/${t.id}`, title: `${t.artist.name} – ${t.title}` };
}

async function findApple(artist, title) {
  countCall('apple');
  const d = await getJson(`https://itunes.apple.com/search?entity=song&limit=8&term=${encodeURIComponent(`${firstArtist(artist)} ${title}`)}`);
  const t = (d.results || []).find(x => x.trackViewUrl && agree(artist, title, x.artistName, x.trackName));
  return t && { platform: 'apple', url: t.trackViewUrl.replace(/&uo=\d+/, ''), title: `${t.artistName} – ${t.trackName}` };
}

// MusicBrainz asks for one request a second, whatever the caller: one queue.
let mbChain = Promise.resolve();
const mbGap = () => { const r = mbChain.then(() => sleep(1100)); mbChain = r.catch(() => {}); return r; };
async function mb(path) { await mbGap(); countCall('musicbrainz'); return getJson(`https://musicbrainz.org/ws/2/${path}`, { Accept: 'application/json' }); }

async function findMusicBrainz(artist, title) {
  const q = `recording:"${title.replace(/"/g, '')}" AND artist:"${firstArtist(artist).replace(/"/g, '')}"`;
  const d = await mb(`recording?fmt=json&limit=3&query=${encodeURIComponent(q)}`);
  const rec = (d.recordings || []).find(r => (r.score ?? 0) >= 90 && agree(artist, title, (r['artist-credit'] || []).map(c => c.name).join(', '), r.title));
  if (!rec) return [];
  const full = await mb(`recording/${rec.id}?fmt=json&inc=url-rels`);
  const out = [];
  for (const rel of full.relations || []) {
    const url = rel.url?.resource, platform = platformOfUrl(url);
    if (url && platform && !out.some(o => o.platform === platform)) out.push({ platform, url, title: `${firstArtist(artist)} – ${rec.title}` });
  }
  return out;
}

// ── storage ─────────────────────────────────────────────────────────────────
const put = db.prepare(`INSERT OR IGNORE INTO track_sources (track_id, platform, url, title, source) VALUES (?, ?, ?, ?, ?)`);
export function saveSource(trackId, { platform, url, title }, source) {
  if (!trackId || !platform || !url) return false;
  return put.run(trackId, platform, url, title || null, source).changes > 0;
}

// The sources of these tracks (post_tracks ids), best first: { [trackId]: [...] }.
export function sourcesFor(trackIds) {
  if (!trackIds.length) return {};
  const rows = db.prepare(`SELECT track_id, platform, url, title FROM track_sources WHERE track_id IN (${trackIds.map(() => '?').join(',')})`).all(...trackIds);
  const by = {};
  for (const r of rows) (by[r.track_id] ||= []).push({ platform: r.platform, url: r.url, title: r.title, full: !!PLATFORMS[r.platform]?.full });
  for (const list of Object.values(by)) list.sort((a, b) => (PLATFORMS[a.platform]?.rank ?? 9) - (PLATFORMS[b.platform]?.rank ?? 9));
  return by;
}

// Free sources for one track right now (compose, a listener's click): the first
// non-YouTube link, quickly — Spotify, then Deezer, then Apple. -> finder result | null
export async function findFreeLink(artist, title) {
  for (const f of [findSpotify, findDeezer, findApple]) {
    try { const r = await f(artist, title); if (r) return r; } catch { /* next one */ }
  }
  return null;
}

// Everything free for one track, all at once (compose's source chips): the
// results of Spotify, Deezer and Apple that agree with the track.
export async function findFreeSources(artist, title) {
  const got = await Promise.all([findSpotify, findDeezer, findApple].map(f => f(artist, title).catch(() => null)));
  return got.filter(Boolean).map(r => ({ ...r, full: !!PLATFORMS[r.platform]?.full }));
}

// A link a listener added by hand (services/trackLinks.js) reaches every post
// of that release: it becomes one of the track's sources, and when it's a
// full-length one (YouTube, SoundCloud) it replaces a 30-second preview as the
// track's own link. `sub`: { release_id, position (link key), platform, url, fetched_title }.
function postTracksFor(sub) {
  const out = [];
  for (const { id } of db.prepare('SELECT id FROM posts WHERE discogs_id = ?').all(sub.release_id)) {
    const list = db.prepare('SELECT * FROM post_tracks WHERE post_id = ? ORDER BY id').all(id);
    const i = linkKeysOf(list).indexOf(sub.position);
    if (i >= 0) out.push(list[i]);
  }
  return out;
}
export function applyUserLink(sub) {
  for (const t of postTracksFor(sub)) {
    db.prepare(`INSERT INTO track_sources (track_id, platform, url, title, source) VALUES (?, ?, ?, ?, 'user')
                ON CONFLICT(track_id, platform) DO UPDATE SET url = excluded.url, title = excluded.title, source = 'user'
                WHERE track_sources.source = 'user'`)   // never over a link the post or a finder already has
      .run(t.id, sub.platform, sub.url, sub.fetched_title || null);
    const own = platformOfUrl(t.stream_url || t.youtube_url);
    if (PLATFORMS[sub.platform]?.full && !PLATFORMS[own]?.full) {
      db.prepare('UPDATE post_tracks SET stream_url = ?, youtube_url = ? WHERE id = ?').run(sub.url, sub.platform === 'youtube' ? sub.url : t.youtube_url, t.id);
    }
  }
}
export function removeUserLink(sub) {
  for (const t of postTracksFor(sub)) {
    db.prepare('DELETE FROM track_sources WHERE track_id = ? AND platform = ? AND url = ?').run(t.id, sub.platform, sub.url);
    if (t.stream_url === sub.url) {
      const next = sourcesFor([t.id])[t.id]?.[0]?.url || null;
      db.prepare('UPDATE post_tracks SET stream_url = ?, youtube_url = ? WHERE id = ?').run(next, t.youtube_url === sub.url ? null : t.youtube_url, t.id);
    }
  }
}

// ── the background job for a new post ───────────────────────────────────────
const VARIOUS = /^various/i;
function artistAndTitle(post, track) {
  // "Artist - Title" rows on compilations carry their own artist.
  const m = String(track.title).match(/^(.+?)\s+[-–]\s+(.+)$/);
  const releaseArtist = post.artists.find(a => !VARIOUS.test(a))
    || '';
  if (!releaseArtist && m) return { artist: m[1], title: m[2] };
  return { artist: releaseArtist, title: track.title };
}

export async function findSourcesForPost(postId) {
  const post = db.prepare('SELECT id, title FROM posts WHERE id = ?').get(postId);
  if (!post) return { tracks: 0, saved: 0 };
  post.artists = db.prepare('SELECT artist_name FROM post_artists WHERE post_id = ?').all(postId).map(r => r.artist_name);
  const tracks = db.prepare('SELECT * FROM post_tracks WHERE post_id = ? AND sources_checked_at IS NULL ORDER BY id LIMIT 40').all(postId);
  let saved = 0;
  for (const t of tracks) {
    // What the post already carries counts as a source.
    for (const u of [t.stream_url, t.youtube_url]) { const p = platformOfUrl(u); if (p && saveSource(t.id, { platform: p, url: u }, 'post')) saved++; }
    const { artist, title } = artistAndTitle(post, t);
    if (artist && title) {
      const have = new Set(db.prepare('SELECT platform FROM track_sources WHERE track_id = ?').all(t.id).map(r => r.platform));
      const jobs = [];
      if (!have.has('spotify')) jobs.push(findSpotify(artist, title).then(r => r && [r]).catch(() => null));
      if (!have.has('deezer')) jobs.push(findDeezer(artist, title).then(r => r && [r]).catch(() => null));
      if (!have.has('apple')) jobs.push(findApple(artist, title).then(r => r && [r]).catch(() => null));
      jobs.push(findMusicBrainz(artist, title).catch(() => null));
      for (const list of await Promise.all(jobs)) for (const r of list || []) if (saveSource(t.id, r, `${r.platform === 'youtube' || r.platform === 'soundcloud' || r.platform === 'bandcamp' ? 'musicbrainz' : r.platform + '-search'}`)) saved++;
    }
    db.prepare(`UPDATE post_tracks SET sources_checked_at = datetime('now') WHERE id = ?`).run(t.id);
    await sleep(250);
  }
  return { tracks: tracks.length, saved };
}

// One post at a time, so a burst of posts never becomes a burst of requests.
let queue = Promise.resolve();
export function queuePostSources(postId, delayMs = 4000) {
  queue = queue.then(async () => {
    await sleep(delayMs);
    const r = await findSourcesForPost(postId);
    if (r.tracks) logEvent('info', 'crawl', `Free sources for post #${postId}: ${r.saved} links across ${r.tracks} tracks`, {});
  }).catch(e => console.warn('[track-sources]', e.message));
  return queue;
}
export { findDeezer, findApple, findMusicBrainz };
