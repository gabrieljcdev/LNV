// Spotify placeholder -> YouTube (2026-10-22). When a record is posted and a track has no YouTube link yet, the post keeps a Spotify link so there is
// something to play (compose does this). Later the link finders (the gap sweep, the nightly spare-units job, Discogs' own videos, a listener's added link)
// put a YouTube link for that track in release_track_links. This puts it on the post: a track whose post link is still the Spotify placeholder recorded
// there (release_track_links.spotify_url) gets the YouTube link, which plays in full where a Spotify embed is a 30-second preview for people not signed in.
// It costs no YouTube units (database only). Not touched: a post link that is not Spotify, a track with no YouTube link yet, a record the post has no
// Discogs id for. A flagged-wrong link is never offered (release_track_links refuses it). PLACEHOLDER_SWAP=0 switches it off.
import db from '../db/database.js';
import { linkKeysOf } from './releaseSpotify.js';
import { logEvent } from './logService.js';

const spotifyTracks = db.prepare(`SELECT DISTINCT t.post_id, p.discogs_id FROM post_tracks t JOIN posts p ON p.id = t.post_id
  WHERE p.discogs_id IS NOT NULL AND t.stream_url LIKE '%spotify.com/%'`);
const tracksOf = db.prepare('SELECT id, position, stream_url FROM post_tracks WHERE post_id = ? ORDER BY id');
const linkOf = db.prepare('SELECT youtube_url, spotify_url FROM release_track_links WHERE release_id = ? AND position = ?');
const swap = db.prepare("UPDATE post_tracks SET stream_url = ?, youtube_url = ? WHERE id = ? AND stream_url = ?");

export function swapPlaceholders({ dry = false } = {}) {
  const out = { posts: 0, tracks: 0, swapped: 0, dry };
  for (const p of spotifyTracks.all()) {
    out.posts++;
    const tracks = tracksOf.all(p.post_id);
    const keys = linkKeysOf(tracks);
    tracks.forEach((t, i) => {
      if (!t.stream_url || !/spotify\.com\//.test(t.stream_url) || !keys[i]) return;
      out.tracks++;
      const l = linkOf.get(p.discogs_id, keys[i]);
      if (!l?.youtube_url || !/youtu/.test(l.youtube_url) || l.spotify_url !== t.stream_url) return;   // only the placeholder this record recorded
      if (!dry) swap.run(l.youtube_url, l.youtube_url, t.id, t.stream_url);
      out.swapped++;
    });
  }
  if (!dry && out.swapped) logEvent('info', 'links', `Spotify placeholders swapped for YouTube links: ${out.swapped} tracks on ${out.posts} posts checked`);
  return out;
}

// Hourly, and once at start-up after a minute: it only reads and writes the database.
export function startPlaceholderSwap() {
  if (process.env.PLACEHOLDER_SWAP === '0') return;
  const run = () => { try { swapPlaceholders(); } catch (err) { logEvent('error', 'links', `Placeholder swap: ${err.message}`); } };
  setTimeout(run, 60_000).unref?.();
  setInterval(run, 60 * 60 * 1000).unref?.();
}
