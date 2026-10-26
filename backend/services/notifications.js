// Notifications and @mentions (2026-10-22).
//
// What notifies a person (and nothing else does):
//   follow    someone followed you
//   mention   someone tagged you (@username) in a post's text or in a reply
//   reply     someone replied to your post (a private reply too, with no text shown in the list)
//   keep      someone kept your post in their feed (the ♥)
//
// Mentions are plain "@username" in the text (post short note / title / description, or a reply). Decisions taken, easy to change:
//   • replies can tag too, public replies only (a private reply is between two people, it tags nobody);
//   • editing a post notifies only the people newly tagged;
//   • the tagged person can remove their tag (it stops showing on the post; the notification stays in their list, read);
//   • nobody is notified of their own act; nobody who does not exist is tagged.
// A notification is a row with who, what, which post (and reply); the list is joined to current names and titles when read,
// so renaming or deleting a post never leaves stale text. Read ones are pruned after 60 days.
import db from '../db/database.js';

db.exec(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,             -- who is told
  kind TEXT NOT NULL,                   -- follow | mention | reply | keep
  actor_id INTEGER NOT NULL,            -- who did it
  post_id INTEGER,
  comment_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id)');
db.exec(`CREATE TABLE IF NOT EXISTS mentions (
  post_id INTEGER NOT NULL,
  comment_id INTEGER NOT NULL DEFAULT 0,   -- 0 = in the post itself
  user_id INTEGER NOT NULL,                -- who was tagged
  by_user_id INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0,      -- the tagged person took the tag off
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, comment_id, user_id)
)`);

const KINDS = new Set(['follow', 'mention', 'reply', 'keep']);

export function notify(userId, kind, { actorId, postId = null, commentId = null }) {
  try {
    if (!userId || !actorId || userId === actorId || !KINDS.has(kind)) return false;
    // The same act twice in a row (follow, unfollow, follow) is one unread notification, not two.
    const dup = db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND kind = ? AND actor_id = ? AND COALESCE(post_id, 0) = ? AND COALESCE(comment_id, 0) = ? AND read_at IS NULL')
      .get(userId, kind, actorId, postId || 0, commentId || 0);
    if (dup) return false;
    db.prepare('INSERT INTO notifications (user_id, kind, actor_id, post_id, comment_id) VALUES (?, ?, ?, ?, ?)').run(userId, kind, actorId, postId, commentId);
    return true;
  } catch (err) { console.warn('[notifications]', err.message); return false; }   // never break the act that caused it
}

// "@amy", "@amy.b", not an email's "@" and not "@@". Trailing . or - is punctuation, not part of the name.
const MENTION = /(^|[^\w@.])@([A-Za-z0-9_][A-Za-z0-9_.-]{1,22}[A-Za-z0-9_])/g;
export function usernamesIn(...texts) {
  const out = new Set();
  for (const t of texts) for (const m of String(t || '').matchAll(MENTION)) out.add(m[2]);
  return [...out];
}
const userByName = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE ORDER BY username = ? DESC LIMIT 1');
function tagged(names, byUserId) {
  const seen = new Set(), out = [];
  for (const n of names) {
    const u = userByName.get(n, n);
    if (u && u.id !== byUserId && !seen.has(u.id)) { seen.add(u.id); out.push(u); }
  }
  return out;
}

// Record the people tagged in some text and tell the ones not already tagged there. -> the usernames newly tagged.
export function recordMentions({ postId, commentId = 0, byUserId, texts, skipUserIds = [] }) {
  const fresh = [];
  for (const u of tagged(usernamesIn(...[].concat(texts)), byUserId)) {
    if (skipUserIds.includes(u.id)) continue;   // already told another way (the post's owner is told of a reply as a reply)
    const added = db.prepare('INSERT OR IGNORE INTO mentions (post_id, comment_id, user_id, by_user_id) VALUES (?, ?, ?, ?)').run(postId, commentId, u.id, byUserId).changes;
    if (added) { notify(u.id, 'mention', { actorId: byUserId, postId, commentId: commentId || null }); fresh.push(u.username); }
  }
  return fresh;
}

// Who is tagged in a post (not in its replies), minus the ones who removed the tag.
export const mentionsOfPost = postId => db.prepare(`SELECT u.username FROM mentions m JOIN users u ON u.id = m.user_id
  WHERE m.post_id = ? AND m.comment_id = 0 AND m.removed = 0 ORDER BY m.created_at, m.user_id`).all(postId).map(r => r.username);

// The tagged person takes their tag off a post (commentId 0) or a reply.
export function removeMyMention(userId, postId, commentId = 0) {
  return db.prepare('UPDATE mentions SET removed = 1 WHERE post_id = ? AND comment_id = ? AND user_id = ? AND removed = 0').run(postId, commentId, userId).changes > 0;
}

// ── reading ──
const prune = () => db.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < datetime('now', '-60 days')").run();
export const unreadCount = userId => db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).c;

// Newest first, paged by id (`before` = the last id of the previous page). The rows are joined to today's names and titles.
export function listFor(userId, { before = null, limit = 30 } = {}) {
  prune();
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const rows = db.prepare(`
    SELECT n.id, n.kind, n.created_at, n.read_at, n.post_id, n.comment_id,
           COALESCE(NULLIF(a.display_name, ''), a.username) AS actor, a.username AS actor_username,
           p.title AS post_title_raw, p.post_title AS post_short, p.id AS post_exists,
           c.content AS reply_text, c.private AS reply_private
    FROM notifications n
    JOIN users a ON a.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    LEFT JOIN comments c ON c.id = n.comment_id
    WHERE n.user_id = ? AND (? IS NULL OR n.id < ?)
    ORDER BY n.id DESC LIMIT ?`).all(userId, before, before, lim);
  return {
    notifications: rows.map(r => ({
      id: r.id, kind: r.kind, at: r.created_at, read: !!r.read_at,
      actor: r.actor, actor_username: r.actor_username,
      post_id: r.post_exists ? r.post_id : null,                    // a deleted post links nowhere
      post_title: r.post_exists ? (r.post_short || r.post_title_raw) : null,
      comment_id: r.comment_id,
      // The words of a reply (or of the reply that tagged you). A private reply only ever notifies the post's owner, who it was sent to.
      snippet: r.reply_text && (r.kind === 'reply' || r.kind === 'mention') ? String(r.reply_text).slice(0, 140) : null,
      private: !!r.reply_private,
    })),
    unread: unreadCount(userId),
    hasMore: rows.length === lim,
    cursor: rows.at(-1)?.id ?? null,
  };
}

// ids: [..] marks those (yours only); 'all' marks everything.
export function markRead(userId, ids) {
  if (ids === 'all') return db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(userId).changes;
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 200);
  if (!list.length) return 0;
  return db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL AND id IN (${list.map(() => '?').join(',')})`).run(userId, ...list).changes;
}
