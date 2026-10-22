// "Wrong link? Change it" (2026-10-22): a person says a link plays but is the WRONG track, and may paste the right one.
// The existing trackLinks.js handles links people ADD (gates, votes); this handles links that are already there, whoever found
// them (the YouTube search, Discogs' videos, another person).
//
// When is a link flagged (never handed out again for that track)?
//   • an admin reports it                                    -> at once
//   • the reporter pastes a replacement that fits the track  -> at once (a 'strong' verdict: title and artist both show,
//                                                               so the reporter has shown the right one)
//   • BAD_REPORTS_NEEDED different people report it          -> flagged
// A report that does not reach those stays 'reported': the link keeps playing and the count is kept. A reporter can take their
// own report back; an admin can revert a flag. A flagged link is cleared from every place it is stored (the saved links, the
// posts' tracks, the search cache for that track) and refused by every finder (badLinkStore.js).

import db from '../db/database.js';
import { trackKey, mainArtist, coreTitle } from './youtubeService.js';
import { isAdminUser } from './authService.js';
import { logEvent } from './logService.js';
import { parseLink, checkLink, publishUserLink, CONFIRMS_NEEDED } from './trackLinks.js';
import { removeUserLink } from './trackSources.js';
import './badLinkStore.js';

export const BAD_REPORTS_NEEDED = CONFIRMS_NEEDED;   // the same number of people that confirms or drops a pasted link
const REPORTS_PER_DAY = 30, NEW_ACCOUNT_REPORTS = 5, NEW_ACCOUNT_DAYS = 3;

const searchKeyOf = (artist, title) => {
  const t = trackKey(coreTitle(title || ''));
  return t ? `search|${trackKey(mainArtist(artist || ''))}|${t}` : null;
};

function limitFor(user) {
  if (isAdminUser(user)) return null;
  const made = db.prepare("SELECT COUNT(*) c FROM bad_link_reports WHERE user_id = ? AND created_at > datetime('now', '-1 day')").get(user.id).c;
  const age = db.prepare("SELECT (julianday('now') - julianday(created_at)) d FROM users WHERE id = ?").get(user.id)?.d ?? 99;
  const cap = age < NEW_ACCOUNT_DAYS ? NEW_ACCOUNT_REPORTS : REPORTS_PER_DAY;
  return made >= cap ? `That is the most reports you can make in a day (${cap}). Try again tomorrow.` : null;
}

// Take a flagged link out of everywhere it is stored.
function clearEverywhere(b) {
  const col = b.platform === 'spotify' ? 'spotify' : 'youtube';
  db.prepare(`UPDATE release_track_links SET ${col}_url = NULL, ${col}_title = NULL WHERE release_id = ? AND position = ? AND ${col}_url = ?`).run(b.release_id, b.position, b.url);
  removeUserLink({ release_id: b.release_id, position: b.position, platform: b.platform, url: b.url });   // the posts' tracks and their saved sources
  if (b.cache_key) db.prepare('UPDATE youtube_cache SET youtube_url = NULL, youtube_title = NULL WHERE query = ? AND youtube_url = ?').run(b.cache_key, b.url);
  db.prepare("UPDATE track_link_submissions SET status = 'rejected', decided_by = 'report' WHERE release_id = ? AND position = ? AND url = ? AND status IN ('live', 'pending')").run(b.release_id, b.position, b.url);
}

function flag(b, by) {
  db.prepare("UPDATE bad_links SET status = 'flagged', flagged_by = ?, flagged_at = datetime('now') WHERE id = ?").run(by, b.id);
  clearEverywhere(b);
  logEvent('info', 'links', `Link flagged as wrong for release ${b.release_id} ${b.position} (${by}): ${b.url}`);
}

// One person's "this is the wrong track". -> { status: 'reported' | 'flagged', reports } or { error, code }
export function reportLink(user, { releaseId, position, url, title, artist, reason }) {
  const rid = Number(releaseId), pos = String(position || '').trim().slice(0, 24);
  const link = parseLink(url);
  if (!Number.isInteger(rid) || !pos || !link) return { error: 'That link could not be identified.', code: 400 };
  const wait = limitFor(user);
  if (wait) return { error: wait, code: 429 };

  const cache_key = searchKeyOf(artist, title);
  db.prepare('INSERT OR IGNORE INTO bad_links (url, release_id, position, cache_key, platform) VALUES (?, ?, ?, ?, ?)').run(link.url, rid, pos, cache_key, link.platform);
  const b = db.prepare('SELECT * FROM bad_links WHERE url = ? AND release_id = ? AND position = ?').get(link.url, rid, pos);
  if (b.status === 'flagged') return { status: 'flagged', reports: b.reports, id: b.id };
  if (!b.cache_key && cache_key) db.prepare('UPDATE bad_links SET cache_key = ? WHERE id = ?').run(cache_key, b.id);

  const fresh = db.prepare('INSERT OR IGNORE INTO bad_link_reports (bad_id, user_id, reason) VALUES (?, ?, ?)').run(b.id, user.id, String(reason || '').slice(0, 200)).changes;
  if (fresh) db.prepare('UPDATE bad_links SET reports = reports + 1 WHERE id = ?').run(b.id);
  const now = db.prepare('SELECT * FROM bad_links WHERE id = ?').get(b.id);
  if (isAdminUser(user)) flag(now, 'admin');
  else if (now.reports >= BAD_REPORTS_NEEDED) flag(now, 'reports');
  return { status: db.prepare('SELECT status FROM bad_links WHERE id = ?').get(b.id).status, reports: now.reports, id: b.id };
}

// "Change it": say the link is wrong AND paste the right one. The new link goes through the same gates as any pasted link; if it
// clearly fits the track it replaces the old one at once and the old one is flagged, otherwise it waits for confirmation
// and the old one only has this person's report against it.
export async function replaceLink(user, { releaseId, position, oldUrl, url, title, artist, reason }) {
  const rid = Number(releaseId), pos = String(position || '').trim().slice(0, 24), tt = String(title || '').trim().slice(0, 300);
  const old = parseLink(oldUrl);
  if (!Number.isInteger(rid) || !pos || !tt || !old) return { error: 'That track could not be identified.', code: 400 };
  const check = await checkLink({ url, title: tt, artist });
  if (!check.ok) return { error: check.reason, code: 422 };
  if (check.link.url === old.url) return { error: 'That is the link already there.', code: 409 };

  const rep = reportLink(user, { releaseId: rid, position: pos, url: old.url, title: tt, artist, reason });
  if (rep.error) return rep;
  if (check.verdict === 'strong') {
    if (rep.status !== 'flagged') flag(db.prepare('SELECT * FROM bad_links WHERE id = ?').get(rep.id), 'replaced');
    const sub = await publishUserLink(user, { releaseId: rid, position: pos, title: tt, artist, check });   // the new link, live at once
    return { ok: true, replaced: true, status: 'live', flagged: true, submission: sub?.id ?? null };
  }
  const sub = await publishUserLink(user, { releaseId: rid, position: pos, title: tt, artist, check });      // 'weak': pending until others confirm
  return { ok: true, replaced: false, status: 'pending', flagged: rep.status === 'flagged', reports: rep.reports, submission: sub?.id ?? null };
}

// Take your own report back (a mistaken one). A flag already made stays until an admin reverts it.
export function withdrawReport(user, badId) {
  const b = db.prepare('SELECT * FROM bad_links WHERE id = ?').get(Number(badId));
  if (!b) return { error: 'No such report.', code: 404 };
  if (b.status === 'flagged') return { error: 'That link has already been flagged; ask an admin to put it back.', code: 409 };
  const gone = db.prepare('DELETE FROM bad_link_reports WHERE bad_id = ? AND user_id = ?').run(b.id, user.id).changes;
  if (!gone) return { error: 'You have not reported that link.', code: 404 };
  db.prepare('UPDATE bad_links SET reports = MAX(0, reports - 1) WHERE id = ?').run(b.id);
  return { status: 'reported', reports: Math.max(0, b.reports - 1) };
}

// ── admin ──
const nameOf = id => db.prepare("SELECT COALESCE(NULLIF(display_name, ''), username) n FROM users WHERE id = ?").get(id)?.n || 'someone';
export function adminBadLinks() {
  return db.prepare('SELECT * FROM bad_links ORDER BY (status = \'reported\') DESC, COALESCE(flagged_at, created_at) DESC LIMIT 200').all().map(b => ({
    id: b.id, url: b.url, releaseId: b.release_id, position: b.position, platform: b.platform, status: b.status, reports: b.reports,
    flaggedBy: b.flagged_by, at: b.flagged_at || b.created_at,
    reporters: db.prepare('SELECT user_id, reason FROM bad_link_reports WHERE bad_id = ?').all(b.id).map(r => ({ by: nameOf(r.user_id), reason: r.reason })),
  }));
}
// Put a flagged link back in play: the flag and its reports are deleted (the link is not restored by itself; a finder or a person can add it again).
export function adminRevert(id, admin) {
  const b = db.prepare('SELECT * FROM bad_links WHERE id = ?').get(Number(id));
  if (!b) return null;
  db.prepare('DELETE FROM bad_link_reports WHERE bad_id = ?').run(b.id);
  db.prepare('DELETE FROM bad_links WHERE id = ?').run(b.id);
  logEvent('info', 'links', `${admin.username} reverted the wrong-link flag on release ${b.release_id} ${b.position}`);
  return { reverted: b.id };
}
