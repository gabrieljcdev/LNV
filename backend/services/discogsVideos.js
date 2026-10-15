// Discogs first (2026-10-09, gabriel: deep dives into 90s artists and labels would burn YouTube quota).
// Many Discogs releases list their own YouTube videos. When a release is opened from an artist or label
// catalogue, or one of its tracks is played, match those videos to the tracks FIRST, check each is still alive
// (free oEmbed), and save the matches in release_track_links (source 'discogs-video'). The next person, the next
// device and the spare-units job then find them saved, and YouTube search is only for what Discogs could not give.
// Strict on purpose: the video title must carry the whole track title AND the artist (linkVerdict 'strong').
// Never touches a link someone added by hand, or one already found.
import db from '../db/database.js';
import { getRelease } from './discogsService.js';
import { videoAlive, linkVerdict, extractVideoId } from './youtubeService.js';
import { linkKeysOf } from './releaseSpotify.js';

db.exec(`CREATE TABLE IF NOT EXISTS discogs_videos_checked (
  release_id INTEGER PRIMARY KEY, checked_at TEXT NOT NULL DEFAULT (datetime('now')), matched INTEGER NOT NULL DEFAULT 0, videos INTEGER NOT NULL DEFAULT 0)`);

const checked = db.prepare("SELECT matched FROM discogs_videos_checked WHERE release_id = ? AND checked_at > datetime('now', '-30 days')");
const record = db.prepare(`INSERT INTO discogs_videos_checked (release_id, checked_at, matched, videos) VALUES (?, datetime('now'), ?, ?)
  ON CONFLICT(release_id) DO UPDATE SET checked_at = excluded.checked_at, matched = excluded.matched, videos = excluded.videos`);
const have = db.prepare('SELECT youtube_url, source FROM release_track_links WHERE release_id = ? AND position = ?');
const save = db.prepare(`INSERT INTO release_track_links (release_id, position, title, youtube_url, youtube_title, source, fetched_at, paid)
  VALUES (?, ?, ?, ?, ?, 'discogs-video', datetime('now'), 0)
  ON CONFLICT(release_id, position) DO UPDATE SET youtube_url = excluded.youtube_url, youtube_title = excluded.youtube_title,
    source = excluded.source, fetched_at = excluded.fetched_at
  WHERE release_track_links.youtube_url IS NULL`);

// The release's tracks as the link table keys them (headings left out): [{ key, title, artist }].
export function keyedTracks(rel) {
  const list = rel?.tracklist || [];
  const kept = list.filter(t => t.title && (t.position || !list.some(x => x.position)));
  const ks = linkKeysOf(kept);
  const relArtist = (rel?.artists || []).map(a => a.name).filter(Boolean).join(', ');
  return kept.map((t, i) => ({ key: ks[i], title: t.title, artist: (t.artists || []).map(a => a.name).filter(Boolean).join(', ') || relArtist }));
}

const inFlight = new Map();
// -> { matched, videos, skipped? }. Safe to call often: one check per release per 30 days (force overrides).
export function linkFromDiscogsVideos(releaseId, { force = false } = {}) {
  const id = Number(releaseId);
  if (!Number.isInteger(id)) return Promise.resolve({ matched: 0, videos: 0, skipped: 'no release' });
  if (!force && checked.get(id)) return Promise.resolve({ matched: 0, videos: 0, skipped: 'checked lately' });
  if (inFlight.has(id)) return inFlight.get(id);
  const job = (async () => {
    const rel = await getRelease(id, { background: true }).catch(() => null);
    if (!rel) return { matched: 0, videos: 0, skipped: 'release unavailable' };   // not recorded: try again next time
    const videos = (rel.videos || []).filter(v => extractVideoId(v.url)).map(v => ({ id: extractVideoId(v.url), title: v.title || '' }));
    const tracks = keyedTracks(rel);
    const used = new Set();
    let matched = 0;
    for (const t of tracks) {
      const cur = have.get(id, t.key);
      if (cur?.youtube_url) continue;                      // already has a link (any source, user links included)
      const hits = videos.filter(v => !used.has(v.id) && linkVerdict({ fetchedTitle: v.title, author: '', trackTitle: t.title, artist: t.artist }).verdict === 'strong');
      if (hits.length !== 1) continue;                      // none, or ambiguous: leave it for a search
      const v = hits[0], url = `https://www.youtube.com/watch?v=${v.id}`;
      if (!(await videoAlive(url))) continue;               // removed, or embedding switched off
      save.run(id, t.key, t.title, url, v.title);
      used.add(v.id); matched++;
    }
    record.run(id, matched, videos.length);
    return { matched, videos: videos.length };
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, job);
  return job;
}
