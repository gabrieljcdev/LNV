// Links people add by hand (2026-10-07). When nothing finds a track — YouTube
// has no upload, Spotify doesn't list it — a listener can paste a link. A
// pasted link goes through three gates so it can't be used to troll:
//
//   1. Allowed sources only: a YouTube video, a SoundCloud track or a Spotify
//      track (no arbitrary URLs: no phishing, no ads, no malware).
//   2. The link is opened (the platform's own free oEmbed call) and its REAL
//      title is compared with the track's artist and title (linkVerdict in
//      youtubeService). A Rickroll on "Second Chances" fails right here.
//        strong  title and artist both show      -> live at once, "added by @name"
//        weak    title fits, artist unclear / a   -> pending: only the poster has
//                different version?                  it until others confirm
//        rejected the title doesn't fit           -> not saved
//   3. Other people: a pending link is offered to other signed-in listeners
//      ("is this right?"); CONFIRMS_NEEDED of them saying yes makes it live,
//      the same number saying no drops it — and the same number of "wrong"
//      votes takes a live user link down again. An admin's vote is final.
//
// Limits: one link per track per person, DAILY_CAP a day (less for new
// accounts). A user link never replaces a link already found; it is saved in
// release_track_links with source 'user', which later searches don't touch.

import fetch from 'node-fetch';
import db from '../db/database.js';
import { extractVideoId, linkVerdict } from './youtubeService.js';
import { spotifyConfigured, spotifyTrack } from './spotifyService.js';
import { isAdminUser } from './authService.js';
import { logEvent } from './logService.js';
import { applyUserLink, removeUserLink } from './trackSources.js';

db.exec(`CREATE TABLE IF NOT EXISTS track_link_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL,
  position TEXT NOT NULL,            -- the link key (see linkKeys in the frontend)
  track_title TEXT,
  artist TEXT,
  url TEXT NOT NULL,
  platform TEXT NOT NULL,            -- youtube | soundcloud | spotify
  fetched_title TEXT,
  thumb TEXT,
  verdict TEXT NOT NULL,             -- strong | weak
  status TEXT NOT NULL,              -- live | pending | rejected
  user_id INTEGER NOT NULL,
  decided_by TEXT,                   -- verdict | votes | admin
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (release_id, position, user_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS track_link_votes (
  submission_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote TEXT NOT NULL,                -- ok | bad
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (submission_id, user_id)
)`);

export const CONFIRMS_NEEDED = 2;
const DAILY_CAP = 20, NEW_ACCOUNT_CAP = 5, NEW_ACCOUNT_DAYS = 3;
const NOT_A_TRACK = new Set(['sets', 'likes', 'followers', 'following', 'reposts', 'tracks', 'albums', 'popular-tracks', 'spotlight', 'comments']);

// What a pasted address is, in its plain public form; null when it isn't one
// of the allowed kinds.
export function parseLink(raw) {
  const text = String(raw || '').trim();
  if (!text || text.length > 500) return null;
  let u;
  try { u = new URL(/^https?:/i.test(text) ? text : `https://${text}`); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./i, '').toLowerCase();
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    const id = extractVideoId(u.href);
    return id ? { platform: 'youtube', url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === 'soundcloud.com') {
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg.length < 2 || NOT_A_TRACK.has(seg[1].toLowerCase())) return null;
    return { platform: 'soundcloud', url: `https://soundcloud.com/${seg[0]}/${seg[1]}` };   // secret-link tokens dropped: public tracks only
  }
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/\/track\/([A-Za-z0-9]{22})/);
    return m ? { platform: 'spotify', url: `https://open.spotify.com/track/${m[1]}`, id: m[1] } : null;
  }
  return null;
}

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// The link's own title, uploader and picture, from the platform's oEmbed
// (free). null = it can't be opened: private, removed, embedding switched off.
export async function fetchMeta(link) {
  if (link.platform === 'youtube') {
    const d = await getJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(link.url)}&format=json`);
    return d && { title: d.title || '', author: d.author_name || '', thumb: d.thumbnail_url || null };
  }
  if (link.platform === 'soundcloud') {
    const d = await getJson(`https://soundcloud.com/oembed?url=${encodeURIComponent(link.url)}&format=json`);
    return d && { title: d.title || '', author: d.author_name || '', thumb: d.thumbnail_url || null };
  }
  const d = await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`);
  if (!d) return null;
  let author = '';
  if (spotifyConfigured()) author = (await spotifyTrack(link.id).catch(() => null))?.artists?.map(a => a.name).join(', ') || '';
  return { title: d.title || '', author, thumb: d.thumbnail_url || null };
}

// Gates 1 and 2. -> { ok, platform, meta, verdict, reason }
export async function checkLink({ url, title, artist }) {
  const link = parseLink(url);
  if (!link) return { ok: false, reason: 'Paste a link to a YouTube video, a SoundCloud track or a Spotify track.' };
  const meta = await fetchMeta(link);
  if (!meta || !meta.title) return { ok: false, reason: "We couldn't open that link — it may be private, removed, or not allowed to be played here." };
  const v = linkVerdict({ fetchedTitle: meta.title, author: meta.author, trackTitle: title, artist });
  return { ok: v.verdict !== 'rejected', link, platform: link.platform, meta, verdict: v.verdict, reason: v.reason || '' };
}

// ── what a live link does to release_track_links ──
function publish(sub) {
  applyUserLink(sub);   // and onto the posts' tracks (trackSources.js)
  const spotify = sub.platform === 'spotify';
  db.prepare(`INSERT INTO release_track_links (release_id, position, title, youtube_url, youtube_title, source, fetched_at, spotify_url, spotify_title)
              VALUES (@release_id, @position, @title, @yt, @yt_title, 'user', datetime('now'), @sp, @sp_title)
              ON CONFLICT(release_id, position) DO UPDATE SET
                ${spotify ? 'spotify_url = excluded.spotify_url, spotify_title = excluded.spotify_title'
                          : "youtube_url = excluded.youtube_url, youtube_title = excluded.youtube_title, source = 'user', fetched_at = datetime('now')"}`)
    .run({ release_id: sub.release_id, position: sub.position, title: sub.track_title || '',
      yt: spotify ? null : sub.url, yt_title: spotify ? null : sub.fetched_title,
      sp: spotify ? sub.url : null, sp_title: spotify ? sub.fetched_title : null });
}
function unpublish(sub) {
  removeUserLink(sub);
  const col = sub.platform === 'spotify' ? 'spotify' : 'youtube';
  db.prepare(`UPDATE release_track_links SET ${col}_url = NULL, ${col}_title = NULL WHERE release_id = ? AND position = ? AND ${col}_url = ?`)
    .run(sub.release_id, sub.position, sub.url);
}

const tally = id => {
  const t = db.prepare(`SELECT SUM(vote = 'ok') ok, SUM(vote = 'bad') bad FROM track_link_votes WHERE submission_id = ?`).get(id);
  return { ok: t.ok || 0, bad: t.bad || 0 };
};

// Gate 1-2 for real, then the daily limits. -> { ok, status, verdict, reason } or { error, code }
export async function addLink(user, { releaseId, position, url, title, artist }) {
  const rid = Number(releaseId), pos = String(position || '').trim().slice(0, 24), tt = String(title || '').trim().slice(0, 300);
  if (!Number.isInteger(rid) || !pos || !tt) return { error: 'That track could not be identified.', code: 400 };

  if (!isAdminUser(user)) {
    const made = db.prepare("SELECT COUNT(*) c FROM track_link_submissions WHERE user_id = ? AND created_at > datetime('now', '-1 day')").get(user.id).c;
    const age = db.prepare("SELECT (julianday('now') - julianday(created_at)) d FROM users WHERE id = ?").get(user.id)?.d ?? 99;
    const cap = age < NEW_ACCOUNT_DAYS ? NEW_ACCOUNT_CAP : DAILY_CAP;
    if (made >= cap) return { error: `That's the most links you can add in a day (${cap}) — try again tomorrow.`, code: 429 };
  }
  const has = db.prepare('SELECT youtube_url FROM release_track_links WHERE release_id = ? AND position = ?').get(rid, pos);
  if (has?.youtube_url) return { error: 'This track already has a link.', code: 409 };

  const check = await checkLink({ url, title: tt, artist });
  if (!check.ok) return { error: check.reason, code: 422 };

  const status = check.verdict === 'strong' ? 'live' : 'pending';
  db.prepare(`INSERT INTO track_link_submissions (release_id, position, track_title, artist, url, platform, fetched_title, thumb, verdict, status, user_id, decided_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(release_id, position, user_id) DO UPDATE SET
                track_title = excluded.track_title, artist = excluded.artist, url = excluded.url, platform = excluded.platform,
                fetched_title = excluded.fetched_title, thumb = excluded.thumb, verdict = excluded.verdict, status = excluded.status,
                decided_by = excluded.decided_by, created_at = datetime('now')`)
    .run(rid, pos, tt, String(artist || '').slice(0, 300), check.link.url, check.platform, check.meta.title, check.meta.thumb, check.verdict, status, user.id, status === 'live' ? 'verdict' : null);
  const sub = db.prepare('SELECT * FROM track_link_submissions WHERE release_id = ? AND position = ? AND user_id = ?').get(rid, pos, user.id);
  db.prepare('DELETE FROM track_link_votes WHERE submission_id = ?').run(sub.id);   // a changed link starts clean
  if (status === 'live') publish(sub);
  logEvent('info', 'links', `${user.username} added a ${status} ${check.platform} link for release ${rid} ${pos}`);
  return { ok: true, status, verdict: check.verdict, reason: check.reason };
}

// "right" / "wrong" on someone else's link. -> { status, ok, bad } or { error, code }
export function vote(user, submissionId, how) {
  const sub = db.prepare('SELECT * FROM track_link_submissions WHERE id = ?').get(Number(submissionId));
  if (!sub || sub.status === 'rejected') return { error: 'That link is no longer there.', code: 404 };
  if (!['ok', 'bad'].includes(how)) return { error: 'Say whether the link is right or wrong.', code: 400 };
  if (sub.user_id === user.id) return { error: "You can't vote on your own link.", code: 403 };

  db.prepare('INSERT OR REPLACE INTO track_link_votes (submission_id, user_id, vote) VALUES (?, ?, ?)').run(sub.id, user.id, how);
  const t = tally(sub.id);
  const admin = isAdminUser(user);
  let status = sub.status;
  if (sub.status === 'pending') {
    if (how === 'ok' && (admin || t.ok >= CONFIRMS_NEEDED)) { status = 'live'; publish(sub); }
    else if (how === 'bad' && (admin || t.bad >= CONFIRMS_NEEDED)) status = 'rejected';
  } else if (sub.status === 'live' && how === 'bad' && (admin || t.bad >= CONFIRMS_NEEDED)) {
    status = 'rejected'; unpublish(sub);
  }
  if (status !== sub.status) {
    db.prepare('UPDATE track_link_submissions SET status = ?, decided_by = ? WHERE id = ?').run(status, admin ? 'admin' : 'votes', sub.id);
    logEvent('info', 'links', `Link ${sub.id} (release ${sub.release_id} ${sub.position}) is now ${status}`);
  }
  return { status, ...t };
}

// ── what the track list shows ──
const nameOf = id => db.prepare('SELECT COALESCE(NULLIF(display_name, \'\'), username) n FROM users WHERE id = ?').get(id)?.n || 'someone';

// Pending links from other people, for a signed-in listener to confirm (not ones already voted on).
export function suggestionsFor(releaseId, user) {
  if (!user) return {};
  const rows = db.prepare(`SELECT s.* FROM track_link_submissions s
    WHERE s.release_id = ? AND s.status = 'pending' AND s.user_id <> ?
      AND NOT EXISTS (SELECT 1 FROM track_link_votes v WHERE v.submission_id = s.id AND v.user_id = ?)
    ORDER BY s.created_at`).all(releaseId, user.id, user.id);
  const out = {};
  for (const s of rows) if (!out[s.position]) out[s.position] = { id: s.id, url: s.url, platform: s.platform, title: s.fetched_title, by: nameOf(s.user_id) };
  return out;
}
// The poster's own pending links.
export function mineFor(releaseId, user) {
  if (!user) return {};
  const out = {};
  for (const s of db.prepare("SELECT * FROM track_link_submissions WHERE release_id = ? AND user_id = ? AND status = 'pending'").all(releaseId, user.id)) {
    out[s.position] = { id: s.id, url: s.url, title: s.fetched_title };
  }
  return out;
}
// Who added each live user link, so it can be credited and reported.
export function userLinkInfo(releaseId) {
  const out = {};
  for (const s of db.prepare("SELECT * FROM track_link_submissions WHERE release_id = ? AND status = 'live'").all(releaseId)) {
    out[s.position] = { id: s.id, url: s.url, by: nameOf(s.user_id) };
  }
  return out;
}

// ── admin ──
export function adminList() {
  const rows = db.prepare(`SELECT s.*, (SELECT SUM(vote = 'ok') FROM track_link_votes v WHERE v.submission_id = s.id) ok,
      (SELECT SUM(vote = 'bad') FROM track_link_votes v WHERE v.submission_id = s.id) bad
    FROM track_link_submissions s WHERE s.status = 'pending' OR s.created_at > datetime('now', '-14 days')
    ORDER BY (s.status = 'pending') DESC, s.created_at DESC LIMIT 100`).all();
  return rows.map(s => ({ id: s.id, releaseId: s.release_id, position: s.position, trackTitle: s.track_title, artist: s.artist,
    url: s.url, platform: s.platform, fetchedTitle: s.fetched_title, verdict: s.verdict, status: s.status, decidedBy: s.decided_by,
    by: nameOf(s.user_id), at: s.created_at, ok: s.ok || 0, bad: s.bad || 0 }));
}
export function adminDecide(id, decision, admin) {
  const sub = db.prepare('SELECT * FROM track_link_submissions WHERE id = ?').get(Number(id));
  if (!sub) return null;
  if (decision === 'approve' && sub.status !== 'live') { publish(sub); db.prepare("UPDATE track_link_submissions SET status = 'live', decided_by = 'admin' WHERE id = ?").run(sub.id); }
  else if (decision === 'reject') { if (sub.status === 'live') unpublish(sub); db.prepare("UPDATE track_link_submissions SET status = 'rejected', decided_by = 'admin' WHERE id = ?").run(sub.id); }
  logEvent('info', 'links', `${admin.username} ${decision}d link ${sub.id}`);
  return db.prepare('SELECT status FROM track_link_submissions WHERE id = ?').get(sub.id);
}
