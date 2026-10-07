// Links that can't play (2026-10-07). A YouTube link can stop working in two
// ways: the owner switches embedding off ("Playback on other websites has
// been disabled by the video owner" — Theo Parrish, Second Chances), or the
// video is removed. Both show as a dead player on our site. YouTube's oEmbed
// call says which (4xx = won't play) and costs no quota, so:
//   • a post's tracks are checked a moment after the post is saved or edited,
//   • and every YouTube link on a post track is re-checked every 30 days
//     (a daily sweep, 300 at a time, paced).
// A link that won't play is cleared from the track — and from the saved link
// tables so it isn't handed out again — and replaced by a Spotify
// placeholder — found now when there isn't one yet (free Spotify calls). No YouTube quota is used.

import db from '../db/database.js';
import { extractVideoId, videoAlive } from './youtubeService.js';
import { spotifyConfigured, spotifySearchTrack } from './spotifyService.js';
import { ensureReleaseSpotify } from './releaseSpotify.js';
import { logEvent } from './logService.js';

try { db.exec('ALTER TABLE post_tracks ADD COLUMN link_health_at TEXT'); } catch { /* already there */ }

const PER_SWEEP = 300, GAP_MS = 400, RECHECK = '-30 days';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isYouTube = u => /youtube\.com\/watch|youtu\.be\//i.test(u || '') && !!extractVideoId(u);

// Same rule as linkKeys in the frontend (a repeated position becomes "A1~2").
const keysOf = list => {
  const seen = {};
  return list.map(t => {
    const p = t.position || '';
    if (!p) return '';
    seen[p] = (seen[p] || 0) + 1;
    return seen[p] === 1 ? p : `${p}~${seen[p]}`;
  });
};

// A Spotify placeholder for a post track whose YouTube link won't play: the
// one already saved for its release, else the release's Spotify album is
// looked up now, else one Spotify search for the track itself. Free.
async function placeholderFor(postId, trackId) {
  const post = db.prepare('SELECT discogs_id FROM posts WHERE id = ?').get(postId);
  const tracks = db.prepare('SELECT id, position, title FROM post_tracks WHERE post_id = ? ORDER BY id').all(postId);
  const at = tracks.findIndex(t => t.id === trackId);
  const key = keysOf(tracks)[at];
  const saved = () => (post?.discogs_id && key
    ? db.prepare('SELECT spotify_url FROM release_track_links WHERE release_id = ? AND position = ?').get(post.discogs_id, key)?.spotify_url
    : null) || null;

  let url = saved();
  if (!url && post?.discogs_id && spotifyConfigured()) {
    await ensureReleaseSpotify(post.discogs_id).catch(() => null);
    url = saved();
  }
  if (!url && spotifyConfigured()) {
    const artist = db.prepare('SELECT artist_name FROM post_artists WHERE post_id = ? ORDER BY id').all(postId).map(r => r.artist_name).join(', ');
    const hit = artist ? await spotifySearchTrack(artist, tracks[at]?.title).catch(() => null) : null;
    if (hit) {
      url = hit.url;
      if (post?.discogs_id && key) {
        db.prepare(`INSERT INTO release_track_links (release_id, position, title, source, fetched_at, spotify_url, spotify_title)
                    VALUES (?, ?, ?, 'spotify-track', datetime('now'), ?, ?)
                    ON CONFLICT(release_id, position) DO UPDATE SET spotify_url = excluded.spotify_url, spotify_title = excluded.spotify_title
                    WHERE NOT (release_track_links.source = 'user' AND release_track_links.spotify_url IS NOT NULL)`)
          .run(post.discogs_id, key, tracks[at].title, hit.url, `${hit.artists.join(', ')} – ${hit.name}`);
      }
    }
  }
  return url;
}

async function checkRows(rows) {
  let checked = 0, bad = 0, replaced = 0;
  for (const t of rows) {
    const url = t.stream_url || t.youtube_url;
    if (isYouTube(url)) {
      checked++;
      if (!(await videoAlive(url))) {
        bad++;
        const sp = await placeholderFor(t.post_id, t.id);
        db.prepare('UPDATE post_tracks SET stream_url = ?, youtube_url = ? WHERE id = ?').run(sp, sp, t.id);
        if (sp) replaced++;
        // not handed out again from the saved tables either
        db.prepare("UPDATE release_track_links SET youtube_url = NULL, youtube_title = NULL WHERE youtube_url = ? AND COALESCE(source, '') <> 'user'").run(url);
        db.prepare('UPDATE youtube_cache SET youtube_url = NULL, youtube_title = NULL WHERE youtube_url = ?').run(url);
        logEvent('info', 'links', `Unplayable YouTube link cleared from post #${t.post_id} "${t.title}"${sp ? ' (Spotify placeholder in its place)' : ''}`);
        await sleep(GAP_MS);
        continue;
      }
      await sleep(GAP_MS);
    }
    db.prepare("UPDATE post_tracks SET link_health_at = datetime('now') WHERE id = ?").run(t.id);
  }
  return { checked, bad, replaced };
}

// One post, right after it is saved or edited.
export function checkPostLinks(postId) {
  const rows = db.prepare('SELECT id, post_id, title, youtube_url, stream_url FROM post_tracks WHERE post_id = ?').all(postId);
  return checkRows(rows);
}

// Everything not looked at in the last 30 days.
export async function sweepLinkHealth() {
  const rows = db.prepare(`SELECT id, post_id, title, youtube_url, stream_url FROM post_tracks
    WHERE (COALESCE(youtube_url, '') <> '' OR COALESCE(stream_url, '') <> '')
      AND (link_health_at IS NULL OR link_health_at < datetime('now', ?))
    ORDER BY link_health_at IS NOT NULL, post_id DESC LIMIT ?`).all(RECHECK, PER_SWEEP);
  const r = await checkRows(rows);
  if (r.checked) logEvent('info', 'links', `Link health: checked ${r.checked} YouTube link${r.checked === 1 ? '' : 's'}, ${r.bad} unplayable${r.bad ? ` (${r.replaced} replaced by Spotify)` : ''}`);
  return r;
}

let running = false;
export function startLinkHealth() {
  const run = async () => {
    if (running) return;
    running = true;
    try { await sweepLinkHealth(); }
    catch (err) { logEvent('error', 'links', `Link health: ${err.message}`); }
    finally { running = false; }
  };
  setTimeout(run, 90 * 1000);
  setInterval(run, 24 * 60 * 60 * 1000);
}
