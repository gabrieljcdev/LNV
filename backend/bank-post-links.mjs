// Before the launch purge (2026-10-09): copy every playable link that only lives on a post's track into
// release_track_links, the shared table a repost reads first — so reposting those records never goes
// back to a web search. Never overwrites a link that is already saved there.
//   node bank-post-links.mjs          counts what it would save (changes nothing)
//   node bank-post-links.mjs --yes    saves it
// Run from backend/ (uses LNV_DB_PATH if set). Only YouTube and Spotify links fit that table's columns.
import db from './db/database.js';

const apply = process.argv.includes('--yes');
const kind = u => /(^|\.)youtube\.com|youtu\.be/i.test(u) ? 'youtube' : /open\.spotify\.com|spotify:/i.test(u) ? 'spotify' : null;

const rows = db.prepare(`SELECT p.discogs_id release_id, t.position, t.title, t.youtube_url, t.stream_url
  FROM post_tracks t JOIN posts p ON p.id = t.post_id
  WHERE p.discogs_id IS NOT NULL AND COALESCE(t.position, '') != ''
    AND (COALESCE(t.youtube_url, '') != '' OR COALESCE(t.stream_url, '') != '')`).all();
const noRelease = db.prepare(`SELECT COUNT(*) c FROM post_tracks t JOIN posts p ON p.id = t.post_id
  WHERE p.discogs_id IS NULL AND (COALESCE(t.youtube_url, '') != '' OR COALESCE(t.stream_url, '') != '')`).get().c;

const has = db.prepare('SELECT youtube_url, spotify_url FROM release_track_links WHERE release_id = ? AND position = ?');
const addYt = db.prepare(`INSERT INTO release_track_links (release_id, position, title, youtube_url, source, fetched_at) VALUES (?, ?, ?, ?, 'post', datetime('now'))
  ON CONFLICT(release_id, position) DO UPDATE SET youtube_url = excluded.youtube_url, source = 'post', fetched_at = datetime('now') WHERE release_track_links.youtube_url IS NULL`);
const addSp = db.prepare(`INSERT INTO release_track_links (release_id, position, title, spotify_url, source, fetched_at) VALUES (?, ?, ?, ?, 'post', datetime('now'))
  ON CONFLICT(release_id, position) DO UPDATE SET spotify_url = excluded.spotify_url WHERE release_track_links.spotify_url IS NULL`);

let yt = 0, sp = 0, already = 0, other = 0;
const run = db.transaction(() => {
  for (const r of rows) {
    const urls = [r.youtube_url, r.stream_url].filter(Boolean);
    const y = urls.find(u => kind(u) === 'youtube'), s = urls.find(u => kind(u) === 'spotify');
    if (!y && !s) { other++; continue; }
    const cur = has.get(r.release_id, String(r.position));
    if (y) { if (cur?.youtube_url) already++; else { yt++; if (apply) addYt.run(r.release_id, String(r.position), r.title, y); } }
    if (s && !y) { if (cur?.spotify_url) already++; else { sp++; if (apply) addSp.run(r.release_id, String(r.position), r.title, s); } }
  }
});
run();
console.log(`${apply ? 'saved' : 'would save'}: ${yt} YouTube links, ${sp} Spotify links`);
console.log(`already saved (left alone): ${already} · other services (SoundCloud/Bandcamp, no column for them): ${other} · tracks on posts with no Discogs release: ${noRelease}`);
if (!apply) console.log('\nNothing changed. Run again with --yes to save.');
