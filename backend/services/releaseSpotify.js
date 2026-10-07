// A release's Spotify links (2026-10-07). Opening a release, or a link that
// stopped playing, fills it from its Spotify album: provisional links that
// stand in until a YouTube link is found (see routes/discogs.js, linkHealth.js).

import db from '../db/database.js';
import { getRelease } from './discogsService.js';
import { spotifyConfigured, spotifySearchTrack, spotifyAlbumLinks } from './spotifyService.js';

try { db.exec('ALTER TABLE release_track_links ADD COLUMN spotify_url TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE release_track_links ADD COLUMN spotify_title TEXT'); } catch { /* already there */ }
db.exec(`CREATE TABLE IF NOT EXISTS release_spotify (
  release_id INTEGER PRIMARY KEY,
  album_id TEXT,
  matched INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT DEFAULT (datetime('now'))
)`);

// One Spotify album lookup fills a whole release with provisional links
// (2026-10-07). A release with every track matched is done; anything less —
// no album, too few tracks, a track or two Spotify words differently — is
// tried again after 14 days. Free (Spotify), and it never touches a YouTube link already saved.
// The key a track's saved link goes under: its position, or "A1~2" for the
// second A1 of a box set. Same rule as linkKeys in frontend/src/lib/tracklist.js.
export const linkKeysOf = list => {
  const seen = {};
  return list.map(t => {
    const p = t?.position || '';
    if (!p) return '';
    seen[p] = (seen[p] || 0) + 1;
    return seen[p] === 1 ? p : `${p}~${seen[p]}`;
  });
};

export async function ensureReleaseSpotify(releaseId) {
  if (!spotifyConfigured() || !Number.isInteger(releaseId)) return null;
  const done = db.prepare(`SELECT matched, total, checked_at > datetime('now', '-14 days') AS fresh FROM release_spotify WHERE release_id = ?`).get(releaseId);
  if (done && (done.matched >= done.total || done.fresh)) return done;

  const rel = await getRelease(releaseId, { background: true });
  const list = rel.tracklist || [];
  const kept = list.filter(t => t.title && (t.position || !list.some(x => x.position)));   // no heading rows
  const ks = linkKeysOf(kept);
  const tracks = kept.map((t, i) => ({ ...t, key: ks[i] }));
  const names = (rel.artists || []).map(a => a.name);
  const various = /^various/i.test(names[0] || '');
  const record = (albumId, matched) => db.prepare(`INSERT OR REPLACE INTO release_spotify (release_id, album_id, matched, total, checked_at)
    VALUES (?, ?, ?, ?, datetime('now'))`).run(releaseId, albumId || null, matched, tracks.length);
  if (!tracks.length) { record(null, 0); return { matched: 0, total: 0 }; }

  // 1. The album, when most of it matches: a handful of title matches on the
  //    wrong edition would play the wrong recordings. (Not for "Various".)
  const links = {};   // link key -> { url, title, source }
  const album = names.length && !various ? await spotifyAlbumLinks({ artist: names.join(', '), album: rel.title, tracks }).catch(() => null) : null;
  if (album && Object.keys(album.links).length * 2 >= tracks.length) {
    for (const [pos, l] of Object.entries(album.links)) links[pos] = { ...l, source: 'spotify-album' };
  }
  // 2. Whatever the album didn't give — a single whose tracks live on other
  //    albums, a compilation, a title worded differently — one free search each
  //    (8 at most, 4 at a time), by the track's own artist when it has one.
  const rest = tracks.filter(t => t.key && !links[t.key]).slice(0, 8);
  const artistOf = t => ((t.artists || []).map(a => a.name).join(', ')) || (various ? '' : names.join(', '));
  for (let i = 0; i < rest.length; i += 4) {
    await Promise.all(rest.slice(i, i + 4).map(async t => {
      const who = artistOf(t);
      if (!who) return;
      const s = await spotifySearchTrack(who, t.title).catch(() => null);
      if (s) links[t.key] = { url: s.url, title: `${s.artists.join(', ')} – ${s.name}`, source: 'spotify-track' };
    }));
  }

  const save = db.prepare(`INSERT INTO release_track_links (release_id, position, title, source, fetched_at, spotify_url, spotify_title)
                           VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
                           ON CONFLICT(release_id, position) DO UPDATE SET
                             spotify_url = excluded.spotify_url, spotify_title = excluded.spotify_title
                           WHERE NOT (release_track_links.source = 'user' AND release_track_links.spotify_url IS NOT NULL)`);
  const matched = Object.keys(links).length;
  db.transaction(() => {
    for (const t of tracks) { const l = t.key && links[t.key]; if (l) save.run(releaseId, t.key, t.title, l.source, l.url, l.title); }
    record(album?.albumId, matched);
  })();
  return { matched, total: tracks.length };
}
