// Community boards (alpha, 2026-10-06, from the "LNV Community Mockup"
// gabriel approved). Who's been digging in a style — a way to find people
// to follow, not a contest. The rules, written out in full on the About
// page and under every board:
//
// - Only what people choose to post and ♥ counts (posts + post_joins) —
//   never likes, plays, replies or time spent.
// - Different records, not volume: each record once per person, and at
//   most DAILY_CAP of a person's records a day count.
// - Breadth and rarity count more than size: a record counts 1, plus 1 for
//   each different label, plus 1 more when nobody else here posts its label.
// - A style is Discogs' style (Deep House, Dub Techno…), one board each;
//   the broad genres (Electronic, Jazz…) don't get boards.
// - Rising = the last 30 days; all-time = everything.
// - Range = how many styles someone posts, and how evenly.
// - Every row says why it's there — no points or scores are shown.
// - No streaks, badges or reminders. Anyone can leave the boards
//   (users.boards_off) and still see them.

import db from '../db/database.js';

try { db.exec('ALTER TABLE users ADD COLUMN boards_off INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }

export const DAILY_CAP = 3;
const MIN_RECORDS = 2;   // a board needs a little evidence
const BOARD_SIZE = 10;
const RISING_DAYS = 30;
const BROAD = new Set(['electronic', 'rock', 'jazz', 'funk / soul', 'hip hop', 'pop', 'classical', 'reggae', 'latin', 'blues',
  'folk, world, & country', 'stage & screen', 'non-music', "children's", 'brass & military']);

// Each person's records with when they chose them (their post, or their ♥),
// the first time only, at most DAILY_CAP a day. period: 'rising' | 'all'.
function entries(period) {
  const since = period === 'rising' ? `AND at > datetime('now', '-${RISING_DAYS} days')` : '';
  const rows = db.prepare(`
    WITH e AS (
      SELECT wall_user_id AS u, id AS p, created_at AS at FROM posts WHERE is_spotlight = 0
      UNION ALL
      SELECT j.user_id, j.post_id, j.created_at FROM post_joins j JOIN posts p ON p.id = j.post_id AND p.is_spotlight = 0
    ),
    firsts AS (SELECT u, p, MIN(at) AS at FROM e GROUP BY u, p)
    SELECT f.u, f.p, f.at FROM firsts f JOIN users us ON us.id = f.u
    WHERE COALESCE(us.boards_off, 0) = 0 ${since}
    ORDER BY f.u, f.at`).all();
  const perDay = new Map(), out = [];
  for (const r of rows) {
    const k = `${r.u}|${String(r.at).slice(0, 10)}`;
    const n = (perDay.get(k) || 0) + 1;
    perDay.set(k, n);
    if (n <= DAILY_CAP) out.push(r);
  }
  return out;
}

const stylesOf = db.prepare('SELECT DISTINCT genre FROM post_genres WHERE post_id = ?');
const labelOf = db.prepare('SELECT label_name FROM post_labels WHERE post_id = ? ORDER BY id LIMIT 1');
const userRow = db.prepare(`SELECT id, username, created_at, created_at > datetime('now', '-${RISING_DAYS} days') AS is_new FROM users WHERE id = ?`);

// How many people post each label (for "nobody else here posts").
function labelPosters(list) {
  const m = new Map();
  for (const r of list) {
    const l = labelOf.get(r.p)?.label_name;
    if (!l) continue;
    const k = l.toLowerCase();
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(r.u);
  }
  return m;
}
const styleList = postId => stylesOf.all(postId).map(g => g.genre).filter(g => g && !BROAD.has(g.toLowerCase()));

// The styles that have a board, most people first.
export function boardStyles(period = 'all') {
  const people = new Map();
  for (const r of entries(period)) for (const s of styleList(r.p)) {
    if (!people.has(s)) people.set(s, new Map());
    const m = people.get(s);
    m.set(r.u, (m.get(r.u) || 0) + 1);
  }
  return [...people].map(([name, m]) => ({ name, people: [...m.values()].filter(n => n >= MIN_RECORDS).length }))
    .filter(s => s.people > 0)
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
}

// One style's board: up to BOARD_SIZE people, with why each is there.
export function styleBoard(style, period = 'all') {
  const list = entries(period);
  const posters = labelPosters(list);
  const byUser = new Map();
  for (const r of list) {
    if (!styleList(r.p).some(s => s.toLowerCase() === String(style).toLowerCase())) continue;
    if (!byUser.has(r.u)) byUser.set(r.u, { records: 0, labels: new Map(), rare: 0 });
    const b = byUser.get(r.u);
    b.records++;
    const l = labelOf.get(r.p)?.label_name;
    if (l) {
      b.labels.set(l.toLowerCase(), l);
      if ((posters.get(l.toLowerCase())?.size || 0) <= 1) b.rare++;
    }
  }
  return [...byUser]
    .filter(([, b]) => b.records >= MIN_RECORDS)
    .map(([u, b]) => ({ u, b, weight: b.records + b.labels.size + b.rare }))
    .sort((x, y) => y.weight - x.weight || y.b.labels.size - x.b.labels.size)
    .slice(0, BOARD_SIZE)
    .map(({ u, b }) => {
      const usr = userRow.get(u);
      const named = [...b.labels.values()].slice(0, 3);
      const why = [`${b.records} record${b.records === 1 ? '' : 's'}`,
        b.labels.size > 3 ? `${b.labels.size} labels` : named.join(', '),
        b.rare ? `${b.rare} nobody else here posts` : ''].filter(Boolean).join(' · ');
      return { username: usr.username, isNew: !!usr.is_new, why };
    });
}

// Range: how many styles someone posts, and how evenly.
export function rangeBoard(period = 'all') {
  const byUser = new Map();
  for (const r of entries(period)) {
    if (!byUser.has(r.u)) byUser.set(r.u, new Map());
    const m = byUser.get(r.u);
    for (const s of styleList(r.p)) m.set(s, (m.get(s) || 0) + 1);
  }
  return [...byUser]
    .map(([u, m]) => {
      const total = [...m.values()].reduce((a, n) => a + n, 0);
      const top = [...m].sort((a, b) => b[1] - a[1])[0];
      const topShare = total ? top[1] / total : 1;
      return { u, styles: m.size, top: top?.[0], topShare, weight: m.size * (1 - topShare / 2) };
    })
    .filter(x => x.styles >= 3)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, BOARD_SIZE)
    .map(x => {
      const usr = userRow.get(x.u);
      return {
        username: usr.username, isNew: !!usr.is_new,
        why: `${x.styles} styles · ${x.topShare <= 0.2 ? 'spread evenly — no one style above a fifth' : `strongest in ${x.top}`}`,
      };
    });
}

export const boardsOff = userId => !!db.prepare('SELECT boards_off FROM users WHERE id = ?').get(userId)?.boards_off;
export const setBoardsOff = (userId, off) => db.prepare('UPDATE users SET boards_off = ? WHERE id = ?').run(off ? 1 : 0, userId);
