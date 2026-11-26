// Playable coverage (2026-10-22): how much of what is on the site can actually be played, and how. For the admin screen; database only, no outside calls.
//   tracks on live posts: each counted once by the best link it has: YouTube / SoundCloud / Bandcamp / other direct link (full length), Spotify only
//   (a placeholder: a 30-second preview unless the listener is signed in there), or nothing.
//   the link book (release_track_links): rows with a YouTube link, Spotify only, nothing yet, added by a listener; and links flagged wrong.
import db from '../db/database.js';
import { swapPlaceholders } from './placeholderSwap.js';

const one = sql => db.prepare(sql).get();
const LINK = "COALESCE(NULLIF(t.stream_url, ''), NULLIF(t.youtube_url, ''), '')";

export function playableCoverage() {
  const t = one(`SELECT COUNT(*) total,
      COALESCE(SUM(${LINK} LIKE '%youtu%'), 0) youtube,
      COALESCE(SUM(${LINK} LIKE '%soundcloud.com%'), 0) soundcloud,
      COALESCE(SUM(${LINK} LIKE '%bandcamp.com%'), 0) bandcamp,
      COALESCE(SUM(${LINK} LIKE '%spotify.com%'), 0) spotify,
      COALESCE(SUM(${LINK} = ''), 0) none
    FROM post_tracks t JOIN posts p ON p.id = t.post_id WHERE p.is_spotlight = 0`);
  const direct = t.youtube + t.soundcloud + t.bandcamp;
  const other = Math.max(0, t.total - direct - t.spotify - t.none);
  const book = one(`SELECT COUNT(*) total,
      COALESCE(SUM(youtube_url IS NOT NULL), 0) youtube,
      COALESCE(SUM(youtube_url IS NULL AND spotify_url IS NOT NULL), 0) spotifyOnly,
      COALESCE(SUM(youtube_url IS NULL AND spotify_url IS NULL), 0) no_link,
      COALESCE(SUM(source = 'user'), 0) byListeners
    FROM release_track_links`);
  const flagged = one("SELECT COUNT(*) c FROM bad_links WHERE status <> 'reported'").c;
  let waiting = 0;
  try { waiting = swapPlaceholders({ dry: true }).swapped; } catch { /* the table may not exist on a fresh database */ }
  const pct = n => (t.total ? Math.round((n / t.total) * 1000) / 10 : 0);
  return {
    tracks: { total: t.total, youtube: t.youtube, soundcloud: t.soundcloud, bandcamp: t.bandcamp, otherDirect: other, spotifyOnly: t.spotify, none: t.none,
      playablePct: pct(t.total - t.none), fullLengthPct: pct(direct + other) },
    book: { ...book, flagged },
    placeholdersReadyToSwap: waiting,
  };
}
