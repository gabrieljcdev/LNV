// Finds the Discogs release for posts that don't have one, so every
// release-type post can link to Discogs (release page + marketplace).
//
// Compose already matches at paste time; this catches what that missed:
// posts saved before compose sent discogs_id (fixed 2026-09-25), platform-only
// pastes of releases Discogs didn't list yet, and anything else unmatched.
// Uses the same tryDiscogsLookup as /api/media/resolve, including its
// artist+title plausibility check, so it never attaches a wrong release.
//
// Runs: after each new post (posts.js), shortly after startup, then hourly.
// Each unmatched post is retried at most once a day (discogs_checked_at).
// One lookup is ~1 search + up to 5 release fetches (many from the 30-day
// cache), so posts are spaced 8s apart: worst case ~45 calls/min, under
// Discogs' 60/min. Live sets are skipped — they aren't releases.
//
// This is a small precursor to the enrichment worker in the fetch-pipeline
// plan (step 3), which will replace it.

import db from '../db/database.js';
import { tryDiscogsLookup } from '../routes/media.js';

const GAP_MS = 8000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let running = false;
let again = false;

export async function matchMissingDiscogs() {
  if (running) { again = true; return; }
  running = true;
  try {
    do {
      again = false;
      const posts = db.prepare(`
        SELECT id, title FROM posts
        WHERE discogs_id IS NULL
          AND COALESCE(post_type, '') != 'livemix'
          AND (discogs_checked_at IS NULL OR discogs_checked_at < datetime('now', '-1 day'))
        ORDER BY id DESC
      `).all();

      for (const p of posts) {
        const artist = db.prepare('SELECT artist_name FROM post_artists WHERE post_id = ?')
          .all(p.id).map(r => r.artist_name).filter(Boolean).join(', ');
        let hit = null;
        try { hit = await tryDiscogsLookup(artist, p.title); } catch { /* retried tomorrow */ }

        if (hit?.discogs_id) {
          db.prepare(`UPDATE posts SET discogs_id = ?, discogs_url = COALESCE(discogs_url, ?), discogs_checked_at = datetime('now')
                      WHERE id = ? AND discogs_id IS NULL`)
            .run(hit.discogs_id, `https://www.discogs.com/release/${hit.discogs_id}`, p.id);
          console.log(`[discogs-match] post #${p.id} "${p.title}" -> release ${hit.discogs_id}`);
        } else {
          db.prepare(`UPDATE posts SET discogs_checked_at = datetime('now') WHERE id = ?`).run(p.id);
        }
        await sleep(GAP_MS);
      }
    } while (again);
  } finally {
    running = false;
  }
}

export function startDiscogsMatcher() {
  const run = () => matchMissingDiscogs().catch(e => console.warn('[discogs-match]', e.message));
  setTimeout(run, 10_000);
  setInterval(run, 60 * 60 * 1000);
}
