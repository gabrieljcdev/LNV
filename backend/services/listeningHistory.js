// Listening history (2026-10-22): the plays, finishes and skips of the people who switch it on, kept in the separate activity
// database (db/activityDb.js), never in the music database.
//
// The rules (they match what the About and the privacy notice must say before this goes live):
//   • OFF until the person turns it on (user_prefs.keep_listening). While off, nothing is recorded and the endpoint says so.
//   • Private to the account: nothing here is shown on a wall or to anyone else; the only readers are these routes, for the
//     signed-in person's own data.
//   • The person can see it (recent plays, a summary), take it with them (export) and clear it, or switch it off and clear it.
//   • Ids and short labels only, never text. Old plays roll off after LISTENING_KEEP_DAYS.
//   • It never steers what plays or what the feed shows: the site connects people, it does not recommend tracks. A summary is
//     for the person to read about themselves.
import db from '../db/database.js';
import activity, { LISTEN_KINDS, LISTENING_KEEP_DAYS } from '../db/activityDb.js';

const SOURCES = new Set(['youtube', 'spotify', 'soundcloud', 'bandcamp', 'apple', 'deezer', 'tidal', 'other']);
const PLACES = new Set(['card', 'drawer', 'playlist', 'queue', 'spotlight', 'wall']);
const MAX_BATCH = 20;
const MAX_MS = 4 * 60 * 60 * 1000;

export const keepsListening = userId => !!activity.prepare('SELECT keep_listening k FROM user_prefs WHERE user_id = ?').get(userId)?.k;
export function setKeepListening(userId, on) {
  activity.prepare(`INSERT INTO user_prefs (user_id, keep_listening, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET keep_listening = excluded.keep_listening, updated_at = excluded.updated_at`).run(userId, on ? 1 : 0);
  return !!on;
}

const int = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
// One incoming event, cleaned: or null if it is not a listening event.
function clean(e) {
  if (!e || !LISTEN_KINDS.includes(e.kind)) return null;
  const postId = int(e.post_id), trackId = int(e.track_id);
  if (!postId && !trackId) return null;
  const ms = Number(e.ms_played);
  return {
    kind: e.kind, postId, trackId,
    source: SOURCES.has(e.source) ? e.source : null,
    place: PLACES.has(e.place) ? e.place : null,
    ms: e.ms_played != null && Number.isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), MAX_MS) : null,
  };
}

// -> { recorded, off? }. A batch of up to MAX_BATCH events from the player.
export function recordListening(userId, events) {
  if (!keepsListening(userId)) return { recorded: 0, off: true };
  const list = (Array.isArray(events) ? events : []).slice(0, MAX_BATCH).map(clean).filter(Boolean);
  const ins = activity.prepare('INSERT INTO events (user_id, kind, post_id, track_id, source, place, ms_played) VALUES (?, ?, ?, ?, ?, ?, ?)');
  activity.transaction(() => { for (const e of list) ins.run(userId, e.kind, e.postId, e.trackId, e.source, e.place, e.ms); })();
  return { recorded: list.length };
}

// Recent plays with today's titles from the music database, newest first, paged by event id.
export function recentListening(userId, { before = null, limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = activity.prepare(`SELECT id, at, kind, post_id, track_id, source, place, ms_played FROM events
    WHERE user_id = ? AND kind IN ('play', 'finish', 'skip') AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`).all(userId, before, before, lim);
  const post = db.prepare("SELECT p.id, COALESCE(NULLIF(p.post_title, ''), p.title) AS title, COALESCE(p.thumb_image, p.cover_image) AS cover, (SELECT artist_name FROM post_artists a WHERE a.post_id = p.id ORDER BY a.id LIMIT 1) AS artist FROM posts p WHERE p.id = ?");
  const track = db.prepare('SELECT title FROM post_tracks WHERE id = ?');
  return {
    plays: rows.map(r => ({ id: r.id, at: r.at, kind: r.kind, source: r.source, place: r.place, ms_played: r.ms_played, post_id: r.post_id, track_id: r.track_id,
      post: r.post_id ? post.get(r.post_id) || null : null, track: r.track_id ? track.get(r.track_id)?.title || null : null })),
    hasMore: rows.length === lim, cursor: rows.at(-1)?.id ?? null,
  };
}

// About yourself, for you to read: counts and your most-played artists, labels and styles over the last `days`.
export function listeningSummary(userId, daysAsked = 90) {
  const days = Math.min(Math.max(Math.round(Number(daysAsked)) || 90, 1), LISTENING_KEEP_DAYS);
  const since = `-${days} days`;
  const counts = Object.fromEntries(activity.prepare("SELECT kind, COUNT(*) n FROM events WHERE user_id = ? AND kind IN ('play','finish','skip') AND at > datetime('now', ?) GROUP BY kind").all(userId, since).map(r => [r.kind, r.n]));
  const posts = activity.prepare("SELECT post_id, COUNT(*) n FROM events WHERE user_id = ? AND kind = 'play' AND post_id IS NOT NULL AND at > datetime('now', ?) GROUP BY post_id").all(userId, since);
  const tally = sql => {
    const t = new Map();
    for (const { post_id, n } of posts) for (const r of db.prepare(sql).all(post_id)) t.set(r.name, (t.get(r.name) || 0) + n);
    return [...t].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([name, plays]) => ({ name, plays }));
  };
  const bySource = activity.prepare("SELECT source, COUNT(*) n FROM events WHERE user_id = ? AND kind = 'play' AND source IS NOT NULL AND at > datetime('now', ?) GROUP BY source ORDER BY n DESC").all(userId, since);
  return {
    days, plays: counts.play || 0, finishes: counts.finish || 0, skips: counts.skip || 0,
    artists: tally("SELECT artist_name AS name FROM post_artists WHERE post_id = ? AND lower(artist_name) NOT IN ('various', 'various artists')"),
    labels: tally('SELECT label_name AS name FROM post_labels WHERE post_id = ?'),
    styles: tally('SELECT genre AS name FROM post_genres WHERE post_id = ?'),
    sources: bySource.map(r => ({ source: r.source, plays: r.n })),
  };
}

// Everything held about this person in the activity database (all kinds of act), for their export.
export function exportActivity(userId) {
  return {
    exported_at: new Date().toISOString(),
    settings: { keep_listening: keepsListening(userId) },
    events: activity.prepare('SELECT id, at, kind, post_id, track_id, origin, origin_ref, source, place, ms_played, meta FROM events WHERE user_id = ? ORDER BY id').all(userId),
    flow: activity.prepare('SELECT id, at, t, session_id, seq, kind, view, target, ref, ms, meta FROM flow_events WHERE user_id = ? ORDER BY id').all(userId),
  };
}
// Clear the listening history (play / finish / skip) only.
export const clearListening = userId => activity.prepare("DELETE FROM events WHERE user_id = ? AND kind IN ('play', 'finish', 'skip')").run(userId).changes;
// Remove everything held about this person in the activity database (for "delete my data" and account deletion).
export function deleteUserActivity(userId) {
  return activity.transaction(() => {
    const events = activity.prepare('DELETE FROM events WHERE user_id = ?').run(userId).changes + activity.prepare('DELETE FROM flow_events WHERE user_id = ?').run(userId).changes;
    activity.prepare('DELETE FROM user_prefs WHERE user_id = ?').run(userId);
    return events;
  })();
}
